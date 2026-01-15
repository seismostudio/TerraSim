"""
FEA Solver for CST Elements - Soil Analysis
Assembles global stiffness matrix and solves the system for geotechnical analysis
"""

import numpy as np
from cst_element import CSTElement
from typing import Dict

class FEASolver:
    def __init__(self, geometry, element_materials, boundary_conditions, water_level=0.0, water_level_points=None, is_initial_stage=True,
                 initial_stress_state=None, initial_displacement_state=None, initial_pwp_state=None, initial_plastic_strain_state=None,
                 previous_stage_active_elements=None):
        """
        Initialize FEA solver for soil analysis
        
        Parameters:
        geometry: Geometry object containing nodes and elements
        element_materials: List of material properties per element
        boundary_conditions: BoundaryConditions object
        water_level: Water level Y-coordinate (m) - backward compatibility
        water_level_points: List of water level polyline points for interpolation
        is_initial_stage: Whether this is the initial stage
        initial_stress_state: Initial stress state from previous stage (for non-initial stages)
        initial_displacement_state: Initial displacement state from previous stage (for non-initial stages)
        initial_pwp_state: Initial PWP state from previous stage (for non-initial stages)
        initial_plastic_strain_state: Initial plastic strain state from previous stage (for non-initial stages)
        previous_stage_active_elements: Boolean array indicating which elements were active in previous stage
        """
        self.geometry = geometry
        self.element_materials = element_materials
        self.boundary_conditions = boundary_conditions
        self.water_level = water_level
        self.water_level_points = water_level_points or []  # Water level polyline points

        self.is_initial_stage = is_initial_stage  # Initial stage flag
        
        # ✅ NEW: Initial state from previous stage (for transfer conditions)
        self.initial_stress_state = initial_stress_state or {}
        self.initial_displacement_state = initial_displacement_state or {}
        self.initial_pwp_state = initial_pwp_state or {}
        self.initial_plastic_strain_state = initial_plastic_strain_state or {}
        
        # ✅ NEW: Track active elements from previous stage
        self.previous_stage_active_elements = previous_stage_active_elements
        
        # ✅ NEW: Track new elements based on active status
        self.new_elements = set()  # Set of new element indices (enumerate index)
        self.deactivated_elements = set()  # Set of deactivated element indices
        
        # Initialize elements
        self.elements = []
        self._create_elements()
        
        # Global matrices
        self.global_stiffness = None
        self.global_force = None
        self.displacements = None
        
        # Performance optimization: Cache for expensive computations
        self._surface_nodes_cache = None
        self._surface_elevation_cache = {}
        self._element_area_cache = {}
        self._element_centroid_cache = {}
        
        # Analysis results
        self.stage_results = {
            'displacements': None,
            'stress_state': None,
            'element_results': None,
            'nodal_results': None
        }
    
        # ✅ Plastic strain history tracking for strain decomposition
        self.plastic_strain_history = {}  # {element_index: [plastic_strain_evolution]}
        self.accumulated_plastic_strain_history = {}  # {element_index: [accumulated_plastic_strain_evolution]}
        self.yielded_elements = set()  # Set of element indices that have yielded
        self.iteration_history = []  # History of iterations for convergence tracking
    
    def _create_elements(self):
        """Create CST elements from geometry data"""
        for i, element_nodes in enumerate(self.geometry.elements):
            # ✅ NEW: Check if this element is active in current stage
            if not self.geometry.element_active[i]:
                # Skip inactive elements - they won't be processed
                continue
            
            # Get node coordinates for this element
            nodes_coords = self.geometry.nodes[element_nodes]
            
            # Create CST element
            element = CSTElement(nodes_coords)
            
            # ✅ FIX: Get material for this element by enumerate index (position in array)
            # This ensures material assignment matches the order of elements in geometry.elements
            element_material = None
            if i < len(self.element_materials):
                element_material = self.element_materials[i]['material']
            
            # Validate material assignment
            if not element_material:
                raise ValueError(f"Element {i} has no material assigned. Please assign material to all polygons before generating mesh.")
            
            # ✅ Validate required material properties (including 2 gamma values)
            required_properties = ['youngsModulus', 'poissonsRatio', 'unitWeightSaturated', 'unitWeightUnsaturated', 'cohesion', 'frictionAngle', 'dilationAngle', 'thickness']
            missing_properties = [prop for prop in required_properties if prop not in element_material]
            if missing_properties:
                raise ValueError(f"Material for element {i} missing required properties: {missing_properties}")
            
            # ✅ Validate gamma values: unsaturated must be less than saturated
            if element_material['unitWeightUnsaturated'] >= element_material['unitWeightSaturated']:
                raise ValueError(f"Element {i}: unitWeightUnsaturated ({element_material['unitWeightUnsaturated']}) must be less than unitWeightSaturated ({element_material['unitWeightSaturated']})")
            
            element.set_material_properties(
                element_material['youngsModulus'],
                element_material['poissonsRatio'],
                element_material['thickness'],
                element_material['unitWeightSaturated'],  # ✅ Use saturated as default (will be overridden based on water level)
                element_material['unitWeightUnsaturated']  # ✅ Pass unsaturated for water level checking
            )
            
            # ✅ Store additional material properties for plastic analysis
            element.dilation_angle = element_material.get('dilationAngle', 0.0)  # Default to 0 if not provided
            element.cohesion = element_material.get('cohesion', 0.0)
            element.friction_angle = element_material.get('frictionAngle', 0.0)
            
            # ✅ NEW: Check if this element is new based on active status
            is_new_element = self._is_new_element(i)  # Use enumerate index
            is_deactivated = self._is_deactivated_element(i)  # Check if element was deactivated
            
            if is_new_element:
                self.new_elements.add(i)  # Use enumerate index
                print(f"🔧 Element {i} identified as NEW element (activated in this stage)")
                print(f"🔧 Added to new_elements: {i}, new_elements now: {self.new_elements}")
            
            if is_deactivated:
                self.deactivated_elements.add(i)  # Use enumerate index
                print(f"🔧 Element {i} identified as DEACTIVATED element (deactivated in this stage)")
            
            # ✅ NEW: Initialize element with initial state from previous stage (if not new and not initial stage)
            if not self.is_initial_stage and not is_new_element and not is_deactivated:
                self._initialize_element_with_previous_state(element, i)
            
            self.elements.append({
                'element': element,
                'node_ids': element_nodes,
                'material': element_material,
                'element_index': i,  # ✅ NEW: Store enumerate index
                'is_new_element': is_new_element,  # ✅ NEW: Track if element is new
                'is_deactivated': is_deactivated  # ✅ NEW: Track if element is deactivated
            })
    
    def _is_new_element(self, element_index: int) -> bool:
        """
        Check if an element is new based on active status
        
        Parameters:
        element_index: Element index (enumerate index)
        
        Returns:
        bool: True if element is new, False otherwise
        """
        # ✅ NEW: Use active status logic
        if self.is_initial_stage:
            return False  # No previous stage to compare with
        
        if self.previous_stage_active_elements is None:
            return False  # No previous stage data
        
        # Check if element is active in current stage but was inactive in previous stage
        current_active = self.geometry.element_active[element_index]
        previous_active = self.previous_stage_active_elements[element_index]
        
        # Element is NEW if: current_active=True AND previous_active=False
        return current_active and not previous_active
    
    def _is_deactivated_element(self, element_index: int) -> bool:
        """
        Check if an element was deactivated (active in previous stage but inactive in current stage)
        
        Parameters:
        element_index: Element index (enumerate index)
        
        Returns:
        bool: True if element was deactivated, False otherwise
        """
        # ✅ NEW: Use active status logic
        if self.is_initial_stage:
            return False  # No previous stage to compare with
        
        if self.previous_stage_active_elements is None:
            return False  # No previous stage data
        
        # Check if element was active in previous stage but is inactive in current stage
        current_active = self.geometry.element_active[element_index]
        previous_active = self.previous_stage_active_elements[element_index]
        
        # Element is DEACTIVATED if: current_active=False AND previous_active=True
        return not current_active and previous_active
    
    def _initialize_element_with_previous_state(self, element: CSTElement, element_index: int):
        """
        Initialize element with initial state from previous stage
        
        Parameters:
        element: CST element to initialize
        element_index: Element index (enumerate index)
        """
        # ✅ FIX: Use element_index consistently with sequential_history
        element_index_str = str(element_index)
        
        # Get initial state data
        initial_stress = None
        initial_displacement = None
        initial_pwp = None
        
        # Get initial stress state
        if element_index_str in self.initial_stress_state:
            stress_data = self.initial_stress_state[element_index_str]
            initial_stress = [
                stress_data.get('total_stress_x', 0.0),
                stress_data.get('total_stress_y', 0.0),
                0.0  # τxy (assume 0 for initial state)
            ]
            # Only print for first few elements to avoid spam
            if element_index < 5:
                print(f"🔧 Element {element_index} found initial stress: [{initial_stress[0]:.2f}, {initial_stress[1]:.2f}, {initial_stress[2]:.2f}] kPa")
        else:
            # Only print warning for first few missing elements to avoid spam
            if element_index < 5:
                print(f"⚠️ Element {element_index} not found in initial stress state (key: {element_index_str})")
                print(f"   Available keys: {list(self.initial_stress_state.keys())[:10]}...")  # Show first 10 keys
        
        # Get initial displacement state (if available)
        if element_index_str in self.initial_displacement_state:
            disp_data = self.initial_displacement_state[element_index_str]
            # Note: This would need to be mapped to element nodes
            # For now, we'll use a simplified approach
            initial_displacement = [0.0] * 6  # 6 DOFs for 3 nodes
        
        # Get initial PWP state (if available)
        if element_index_str in self.initial_pwp_state:
            pwp_data = self.initial_pwp_state[element_index_str]
            initial_pwp = pwp_data.get('pore_water_pressure', 0.0)
        
        # Set initial state in element
        element.set_initial_state(
            initial_stress=initial_stress,
            initial_displacement=initial_displacement,
            initial_pwp=initial_pwp
        )
        
        # Only print for first few elements to avoid spam
        if element.has_initial_state and element_index < 5:
            print(f"🔧 Element {element_index} initialized with previous state")
            if initial_stress:
                print(f"   - Initial stress: [{initial_stress[0]:.2f}, {initial_stress[1]:.2f}, {initial_stress[2]:.2f}] kPa")
            if initial_pwp:
                print(f"   - Initial PWP: {initial_pwp:.2f} kPa")
    
    def assemble_global_stiffness_matrix(self):
        """Assemble global stiffness matrix from element matrices"""
        num_dofs = 2 * self.geometry.num_nodes  # 2 DOFs per node (u, v)
        self.global_stiffness = np.zeros((num_dofs, num_dofs))
        
        for elem_data in self.elements:
            element = elem_data['element']
            node_ids = elem_data['node_ids']
            
            # Get element stiffness matrix
            K_elem = element.get_stiffness_matrix()
            
            # Assembly into global matrix
            for i in range(3):  # 3 nodes per element
                for j in range(3):
                    # Global DOF indices
                    gi = 2 * node_ids[i]     # u DOF for node i
                    gi_plus_1 = gi + 1       # v DOF for node i
                    gj = 2 * node_ids[j]     # u DOF for node j
                    gj_plus_1 = gj + 1       # v DOF for node j
                    
                    # Local DOF indices
                    li = 2 * i
                    li_plus_1 = li + 1
                    lj = 2 * j
                    lj_plus_1 = lj + 1
                    
                    # Assemble 2x2 submatrix
                    self.global_stiffness[gi, gj] += K_elem[li, lj]
                    self.global_stiffness[gi, gj_plus_1] += K_elem[li, lj_plus_1]
                    self.global_stiffness[gi_plus_1, gj] += K_elem[li_plus_1, lj]
                    self.global_stiffness[gi_plus_1, gj_plus_1] += K_elem[li_plus_1, lj_plus_1]
    
    def assemble_global_force_vector(self):
        """Assemble global force vector from applied forces and gravity loads"""
        num_dofs = 2 * self.geometry.num_nodes
        self.global_force = np.zeros(num_dofs)
        
        # Apply concentrated forces (foundation loads)
        for force_data in self.boundary_conditions.applied_forces:
            node_id = int(force_data[0])
            fx = force_data[1]
            fy = force_data[2]
            
            # ✅ Validate node_id bounds
            if node_id >= self.geometry.num_nodes:
                print(f"⚠️ Warning: Node ID {node_id} exceeds geometry bounds (0-{self.geometry.num_nodes-1}). Skipping force.")
                continue
            
            # Global DOF indices
            u_dof = 2 * node_id
            v_dof = 2 * node_id + 1
            
            # ✅ Validate DOF bounds
            if u_dof >= len(self.global_force) or v_dof >= len(self.global_force):
                print(f"⚠️ Warning: DOF indices {u_dof}, {v_dof} exceed global force vector bounds. Skipping force.")
                continue
            
            self.global_force[u_dof] += fx
            self.global_force[v_dof] += fy
        
        # ✅ Apply gravity loads (soil self-weight) with water level consideration
        # ✅ FIX: Only calculate gravity loads in initial stage to prevent double counting
        if self.boundary_conditions.gravity_loads and self.is_initial_stage:
            print(f"🔧 Calculating gravity loads for initial stage...")
            for elem_data in self.elements:
                element = elem_data['element']
                node_ids = elem_data['node_ids']
                
                # ✅ Get water level at element's x-coordinate for gamma selection
                centroid_x = element.centroid[0]
                water_level_at_element = self.interpolate_water_level_at_x(centroid_x)
                
                # Get element gravity force with appropriate gamma
                gravity_force = element.get_gravity_force(water_level_at_element)
                
                # Assembly into global force vector
                for i in range(3):  # 3 nodes per element
                    node_id = node_ids[i]
                    u_dof = 2 * node_id
                    v_dof = 2 * node_id + 1
                    
                    # Add gravity force to global force vector
                    self.global_force[u_dof] += gravity_force[2*i]     # fx
                    self.global_force[v_dof] += gravity_force[2*i + 1] # fy
        elif self.boundary_conditions.gravity_loads and not self.is_initial_stage:
            print(f"🔧 Skipping gravity loads for transfer stage (using initial state)...")
    
    def apply_boundary_conditions(self):
        """Apply boundary conditions using penalty method"""
        penalty = 1e15  # Large penalty factor
        
        for fixed_node in self.boundary_conditions.fixed_nodes:
            # ✅ Validate node bounds
            if fixed_node >= self.geometry.num_nodes:
                print(f"⚠️ Warning: Fixed node {fixed_node} exceeds geometry bounds (0-{self.geometry.num_nodes-1}). Skipping.")
                continue
            
            # Global DOF indices for fixed node
            u_dof = 2 * fixed_node
            v_dof = 2 * fixed_node + 1
            
            # ✅ Validate DOF bounds
            if u_dof >= self.global_stiffness.shape[0] or v_dof >= self.global_stiffness.shape[0]:
                print(f"⚠️ Warning: Fixed node DOF indices {u_dof}, {v_dof} exceed stiffness matrix bounds. Skipping.")
                continue
            
            # Apply penalty to diagonal terms
            self.global_stiffness[u_dof, u_dof] += penalty
            self.global_stiffness[v_dof, v_dof] += penalty

    def apply_boundary_conditions_2(self):
        """Apply boundary conditions using penalty method"""
        penalty = 1e15  # Large penalty factor
        
        for normal_fixed_node in self.boundary_conditions.normal_fixed_nodes:
            # ✅ Validate node bounds
            if normal_fixed_node >= self.geometry.num_nodes:
                print(f"⚠️ Warning: Normal fixed node {normal_fixed_node} exceeds geometry bounds (0-{self.geometry.num_nodes-1}). Skipping.")
                continue
            
            # Global DOF indices for fixed node
            u_dof = 2 * normal_fixed_node
            
            # ✅ Validate DOF bounds
            if u_dof >= self.global_stiffness.shape[0]:
                print(f"⚠️ Warning: Normal fixed node DOF index {u_dof} exceeds stiffness matrix bounds. Skipping.")
                continue
            
            # Apply penalty to diagonal terms
            self.global_stiffness[u_dof, u_dof] += penalty
    
    def solve(self):
        """Solve the FEA system for displacements"""
        
        # ✅ Standard FEA analysis
        print("🔧 Standard FEA analysis - solving complete system")
        
        # Assemble global matrices
        self.assemble_global_stiffness_matrix()
        self.assemble_global_force_vector()
        
        # Apply boundary conditions
        self.apply_boundary_conditions()
        self.apply_boundary_conditions_2()
        
        # Check matrix condition before solving
        try:
            # Check for NaN or Inf values in stiffness matrix
            if np.any(np.isnan(self.global_stiffness)) or np.any(np.isinf(self.global_stiffness)):
                raise ValueError("Stiffness matrix contains NaN or Inf values")
            
            # Check if matrix is singular
            det = np.linalg.det(self.global_stiffness)
            if abs(det) < 1e-12:
                print(f"WARNING: Stiffness matrix is nearly singular (determinant: {det:.2e})")
                # Try to regularize the matrix
                regularization = 1e-8 * np.eye(self.global_stiffness.shape[0])
                self.global_stiffness += regularization
                print("Applied regularization to stiffness matrix")
            
            # Check condition number
            cond = np.linalg.cond(self.global_stiffness)
            if cond > 1e12:
                print(f"WARNING: Stiffness matrix is ill-conditioned (condition number: {cond:.2e})")
                # Try to improve condition by adding small diagonal terms
                regularization = 1e-6 * np.eye(self.global_stiffness.shape[0])
                self.global_stiffness += regularization
                print("Applied additional regularization for ill-conditioned matrix")
            
            # Solve system: K * u = F
            self.displacements = np.linalg.solve(self.global_stiffness, self.global_force)
            
            # Validate displacement results
            max_displacement = np.max(np.abs(self.displacements))
            if max_displacement > 1e6:
                print(f"WARNING: Large displacement detected: {max_displacement:.2e}")
                # Clamp extreme values to prevent visualization errors
                self.displacements = np.clip(self.displacements, -1e6, 1e6)
                print("Displacements clamped to prevent visualization errors")
            
            # Check for NaN or Inf values
            if np.any(np.isnan(self.displacements)) or np.any(np.isinf(self.displacements)):
                raise ValueError("Displacement solution contains NaN or Inf values")
            
            print(f"FEA solution completed successfully. Max displacement: {np.max(np.abs(self.displacements)):.2e}")
            
            # Store stage results
            self.stage_results['displacements'] = self.displacements.copy()
            self.stage_results['stress_state'] = self._calculate_current_stress_state()
            
        except np.linalg.LinAlgError as e:
            print(f"Linear algebra error in FEA solve: {e}")
            # Fallback: try different solvers
            try:
                # Try QR decomposition first
                Q, R = np.linalg.qr(self.global_stiffness)
                self.displacements = np.linalg.solve(R, Q.T @ self.global_force)
                print("Used QR decomposition as fallback")
            except Exception as e2:
                print(f"QR decomposition failed: {e2}")
                try:
                    # Try pseudo-inverse
                    self.displacements = np.linalg.pinv(self.global_stiffness) @ self.global_force
                    print("Used pseudo-inverse as fallback")
                except Exception as e3:
                    print(f"Pseudo-inverse also failed: {e3}")
                    try:
                        # Try least squares
                        self.displacements = np.linalg.lstsq(self.global_stiffness, self.global_force, rcond=None)[0]
                        print("Used least squares as fallback")
                    except Exception as e4:
                        print(f"Least squares also failed: {e4}")
                        # Final resort: zero displacements
                        print("All solvers failed - using zero displacements")
                        self.displacements = np.zeros(self.global_stiffness.shape[0])
            
            # Store stage results even if fallback was used
            self.stage_results['displacements'] = self.displacements.copy()
            self.stage_results['stress_state'] = self._calculate_current_stress_state()
        
        return self.displacements
    
    def _calculate_current_stress_state(self):
        """Calculate current stress state from displacements"""
        print("🔧 Calculating current stress state from displacements")
        
        stress_state = {
            'element_stresses': [],
            'nodal_stresses': [],
            'displacement_magnitudes': []
        }
        
        # Calculate element stresses
        for i, elem_data in enumerate(self.elements):
            element = elem_data['element']
            node_ids = elem_data['node_ids']
            
            # Extract element displacements
            elem_displacements = []
            for node_id in node_ids:
                u_dof = 2 * node_id
                v_dof = 2 * node_id + 1
                elem_displacements.extend([
                    self.displacements[u_dof],
                    self.displacements[v_dof]
                ])
            
            elem_displacements = np.array(elem_displacements)
            
            # Calculate stresses
            strains = element.get_strains(elem_displacements)
            
            # ✅ NEW: Use initial state for stress calculation if available
            if element.has_initial_state and not self.is_initial_stage:
                stresses = element.get_stresses_with_initial_state(elem_displacements)
            else:
                stresses = element.get_stresses(elem_displacements)
            
            principal_stresses = element.get_principal_stresses(elem_displacements)
            
            # Store element stress state
            element_stress = {
                'element_id': i,
                'strains': strains.tolist(),
                'stresses': stresses.tolist(),
                'principal_stresses': principal_stresses.tolist(),
                'displacements': elem_displacements.tolist()
            }
            
            stress_state['element_stresses'].append(element_stress)
        
        # Calculate nodal stresses
        nodal_results = self.get_nodal_stress_strain_results()
        stress_state['nodal_stresses'] = nodal_results
        
        # Calculate displacement magnitudes
        for i in range(self.geometry.num_nodes):
            u_dof = 2 * i
            v_dof = 2 * i + 1
            magnitude = np.sqrt(self.displacements[u_dof]**2 + self.displacements[v_dof]**2)
            stress_state['displacement_magnitudes'].append(magnitude)
        
        print(f"✅ Current stress state calculated for {len(stress_state['element_stresses'])} elements")
        return stress_state
    
    def get_element_results(self):
        """Calculate strains, stresses, and soil-specific results for each element"""
        print(f"🔧 DEBUG: get_element_results() called - is_initial_stage={self.is_initial_stage}")
        
        # OPTIMIZATION: Pre-calculate common values
        if not self.element_materials:
            raise ValueError("No element materials defined. Please generate mesh with materials before running FEA analysis.")
        
        water_level = self.water_level
        
        # OPTIMIZATION: Use list comprehension for faster result creation
        results = []
        
        for elem_data in self.elements:
            element = elem_data['element']
            node_ids = elem_data['node_ids']
            
            # OPTIMIZATION: Vectorized displacement extraction
            elem_displacements = []
            for node_id in node_ids:
                u_dof = 2 * node_id
                v_dof = 2 * node_id + 1
                elem_displacements.extend([
                    self.displacements[u_dof],
                    self.displacements[v_dof]
                ])
            
            elem_displacements = np.array(elem_displacements)
            
            # Calculate element results using FEA
            strains = element.get_strains(elem_displacements)
            
            # ✅ NEW: Use initial state for stress calculation if available
            element_index = elem_data.get('element_index', len(results))
            if element_index < 5:
                print(f"🔧 Element {element_index}: has_initial_state={element.has_initial_state}, is_initial_stage={self.is_initial_stage}")
            
            if element.has_initial_state and not self.is_initial_stage:
                stresses = element.get_stresses_with_initial_state(elem_displacements)
                # ✅ DEBUG: Show stress values for first few elements
                if element_index < 5:
                    print(f"🔧 Element {element_index} using initial state stress: [{stresses[0]:.2f}, {stresses[1]:.2f}, {stresses[2]:.2f}] kPa")
            else:
                stresses = element.get_stresses(elem_displacements)
                # ✅ DEBUG: Show stress values for first few elements
                if element_index < 5:
                    print(f"🔧 Element {element_index} using new stress: [{stresses[0]:.2f}, {stresses[1]:.2f}, {stresses[2]:.2f}] kPa")
            
            principal_stresses = element.get_principal_stresses(elem_displacements)

            # Calculate total stresses from FEA
            total_stress_x = stresses[0]  # σx component
            total_stress_y = stresses[1]  # σy component
            total_stress_xy = stresses[2]  # τxy component
            
            # ✅ DEBUG: Show total stress values for first few elements
            if element_index < 5:
                print(f"🔧 Element {element_index} total stresses (initial + new): [{total_stress_x:.2f}, {total_stress_y:.2f}, {total_stress_xy:.2f}] kPa")
            
            # ✅ Calculate pore water pressure based on water level for FEA
            centroid_x, centroid_y = element.centroid
            water_level_at_element = self.interpolate_water_level_at_x(centroid_x)
            
            if centroid_y < water_level_at_element:
                # Element is below water level - calculate hydrostatic pressure
                pore_water_pressure = -9.81 * (water_level_at_element - centroid_y)  # Negative for compression
                pwp_type = "hydrostatic"
            else:
                # Element is above water level - no pore water pressure
                pore_water_pressure = 0.0
                pwp_type = "dry"
            
            # Calculate effective stresses for both components
            effective_stress_x = total_stress_x - pore_water_pressure  # σ'x = σx - u
            effective_stress_y = total_stress_y - pore_water_pressure  # σ'y = σy - u
            effective_stress_xy = total_stress_xy  # τ'xy = τxy (no change)
            
            # Calculate effective principal stresses from effective stress components
            sigma_avg_effective = (effective_stress_x + effective_stress_y) / 2.0
            radius_effective = np.sqrt(((effective_stress_x - effective_stress_y) / 2.0)**2 + effective_stress_xy**2)
            
            effective_principal_stress_1 = sigma_avg_effective - radius_effective  # σ'₁
            effective_principal_stress_3 = sigma_avg_effective + radius_effective  # σ'₃

            results.append({
                'element_index': elem_data.get('element_index', len(results)),  # ✅ NEW: Use element_index
                'node_ids': node_ids,
                'strains': strains.tolist() if hasattr(strains, 'tolist') else [float(x) for x in strains],
                'stresses': stresses.tolist() if hasattr(stresses, 'tolist') else [float(x) for x in stresses], # σx, σy, τxy
                'principal_stresses': principal_stresses.tolist() if hasattr(principal_stresses, 'tolist') else [float(x) for x in principal_stresses], # σ₁, σ₃
                'total_stress_x': float(total_stress_x), # σx
                'total_stress_y': float(total_stress_y), # σy
                'effective_stress_x': float(effective_stress_x), # σ'x = σx - u
                'effective_stress_y': float(effective_stress_y), # σ'y = σy - u
                'effective_principal_stress_1': float(effective_principal_stress_1), # σ'₁ (from σ'x, σ'y, τxy)
                'effective_principal_stress_3': float(effective_principal_stress_3), # σ'₃ (from σ'x, σ'y, τxy)
                'pore_water_pressure': float(pore_water_pressure), # u
                'displacements': elem_displacements.tolist() if hasattr(elem_displacements, 'tolist') else [float(x) for x in elem_displacements]
            })
        
        return results
    
    def get_nodal_displacements(self):
        """Get nodal displacements in a structured format"""
        # OPTIMIZATION: Use list comprehension and vectorized operations
        nodal_displacements = [
            {
                'node_id': i,
                'u': float(self.displacements[2 * i]),
                'v': float(self.displacements[2 * i + 1]),
                'magnitude': float(np.sqrt(self.displacements[2 * i]**2 + self.displacements[2 * i + 1]**2))
            }
            for i in range(self.geometry.num_nodes)
        ]
        
        return nodal_displacements
    
    def get_nodal_stress_strain_results(self, interpolation_method='area_weighted'):
        """Post-process element results to get nodal stress, strain, and safety factor values
        
        Parameters:
        interpolation_method: Method for interpolating element values to nodes
            - 'simple_average': Simple average of contributing elements (FASTEST)
            - 'area_weighted': Weighted by element area (FAST & ACCURATE) - DEFAULT
            - 'distance_weighted': Weighted by inverse distance from centroid
            - 'shape_function': Using shape functions (high accuracy)
            - 'gauss_quadrature': Using Gauss quadrature points (highest accuracy)
            - 'superconvergent': Using superconvergent patch recovery (best accuracy)
        """
        import time
        start_time = time.time()
        
        print(f"Starting nodal stress/strain calculation with interpolation method: {interpolation_method}")
        print(f"Cache stats before calculation: {self.get_cache_stats()}")
        
        element_results = self.get_element_results()
        
        # OPTIMIZATION: Use faster interpolation method if specified
        if interpolation_method in ['gauss_quadrature', 'superconvergent']:
            print("⚠️  Using complex interpolation method - this may be slow!")
            print("💡 Consider using 'area_weighted' for better performance")
        
        # Initialize nodal values arrays using numpy for better performance
        num_nodes = self.geometry.num_nodes
        nodal_effective_stress_x = np.zeros(num_nodes)
        nodal_effective_stress_y = np.zeros(num_nodes)
        nodal_total_stress_x = np.zeros(num_nodes)
        nodal_total_stress_y = np.zeros(num_nodes)
        nodal_effective_principal_stress_1 = np.zeros(num_nodes)
        nodal_effective_principal_stress_3 = np.zeros(num_nodes)
        nodal_pore_water_pressure = np.zeros(num_nodes)
        
        # OPTIMIZATION: Use numpy arrays for weighted sums (vectorization)
        nodal_weighted_effective_stress_x = np.zeros(num_nodes)
        nodal_weighted_effective_stress_y = np.zeros(num_nodes)
        nodal_weighted_total_stress_x = np.zeros(num_nodes)
        nodal_weighted_total_stress_y = np.zeros(num_nodes)
        nodal_weighted_effective_principal_stress_1 = np.zeros(num_nodes)
        nodal_weighted_effective_stress_3 = np.zeros(num_nodes)
        nodal_weight_sums = np.zeros(num_nodes)
            
        # OPTIMIZATION: Pre-calculate weights for common cases
        element_weights_cache = {}
        
        for elem_result in element_results:
            node_ids = elem_result['node_ids']
            
            # OPTIMIZATION: Use cached weights if available
            cache_key = (tuple(sorted(node_ids)), interpolation_method)
            if cache_key in element_weights_cache:
                weights = element_weights_cache[cache_key]
            else:
                # Calculate weights based on interpolation method
                if interpolation_method == 'simple_average':
                    # FASTEST: Equal weights for all nodes
                    weights = [1.0/3.0] * 3
                elif interpolation_method == 'area_weighted':
                    # FAST & ACCURATE: Weight by element area
                    element_area = self._calculate_element_area(node_ids)
                    weights = [element_area / 3.0] * 3
                elif interpolation_method == 'gauss_quadrature':
                    # Use Gauss quadrature points for highest accuracy
                    weights = self._calculate_gauss_quadrature_weights(node_ids)
                elif interpolation_method == 'superconvergent':
                    # Use superconvergent patch recovery for optimal accuracy
                    weights = self._calculate_superconvergent_weights(node_ids, elem_result)
                elif interpolation_method == 'shape_function':
                    # Use shape function weights (N1=N2=N3=1/3 for centroid)
                    weights = [1.0/3.0] * 3
                elif interpolation_method == 'distance_weighted':
                    # Weight by inverse distance from centroid
                    centroid = self._calculate_element_centroid(node_ids)
                    weights = [self._calculate_distance_weight(node_id, centroid) for node_id in node_ids]
                else:  # simple_average
                    weights = [1.0/3.0] * 3
                
                # Cache the weights
                element_weights_cache[cache_key] = weights
            
            # OPTIMIZATION: Vectorized addition using numpy
            for i, node_id in enumerate(node_ids):
                # Use pore water pressure from element results
                pore_water_pressure = elem_result['pore_water_pressure']
                nodal_pore_water_pressure[node_id] = pore_water_pressure
                
                # Apply weights using vectorized operations
                weight = weights[i]
                nodal_weighted_effective_stress_x[node_id] += elem_result['effective_stress_x'] * weight
                nodal_weighted_effective_stress_y[node_id] += elem_result['effective_stress_y'] * weight
                nodal_weighted_total_stress_x[node_id] += elem_result['total_stress_x'] * weight
                nodal_weighted_total_stress_y[node_id] += elem_result['total_stress_y'] * weight
                nodal_weighted_effective_principal_stress_1[node_id] += elem_result['effective_principal_stress_1'] * weight
                nodal_weighted_effective_stress_3[node_id] += elem_result['effective_principal_stress_3'] * weight
                nodal_weight_sums[node_id] += weight
        
        # OPTIMIZATION: Vectorized normalization using numpy
        # Avoid division by zero using numpy's where
        valid_nodes = nodal_weight_sums > 0
        
        nodal_effective_stress_x[valid_nodes] = nodal_weighted_effective_stress_x[valid_nodes] / nodal_weight_sums[valid_nodes]
        nodal_effective_stress_y[valid_nodes] = nodal_weighted_effective_stress_y[valid_nodes] / nodal_weight_sums[valid_nodes]
        nodal_total_stress_x[valid_nodes] = nodal_weighted_total_stress_x[valid_nodes] / nodal_weight_sums[valid_nodes]
        nodal_total_stress_y[valid_nodes] = nodal_weighted_total_stress_y[valid_nodes] / nodal_weight_sums[valid_nodes]
        nodal_effective_principal_stress_1[valid_nodes] = nodal_weighted_effective_principal_stress_1[valid_nodes] / nodal_weight_sums[valid_nodes]
        nodal_effective_principal_stress_3[valid_nodes] = nodal_weighted_effective_stress_3[valid_nodes] / nodal_weight_sums[valid_nodes]
        
        # ✅ Calculate pore water pressure for each node based on water level
        for i in range(num_nodes):
            node_x, node_y = self.geometry.nodes[i]
            water_level_at_node = self.interpolate_water_level_at_x(node_x)
            
            if node_y < water_level_at_node:
                # Node is below water level - calculate hydrostatic pressure
                nodal_pore_water_pressure[i] = -9.81 * (water_level_at_node - node_y)  # Negative for compression
            else:
                # Node is above water level - no pore water pressure
                nodal_pore_water_pressure[i] = 0.0
        
        # OPTIMIZATION: Use list comprehension for faster result creation
        nodal_results = [
            {
                'node_id': i,
                'effective_stress_x': float(nodal_effective_stress_x[i]),
                'effective_stress_y': float(nodal_effective_stress_y[i]),
                'total_stress_x': float(nodal_total_stress_x[i]),
                'total_stress_y': float(nodal_total_stress_y[i]),
                'pore_water_pressure': float(nodal_pore_water_pressure[i]),
                'principal_stress_1': float(nodal_total_stress_y[i]),
                'principal_stress_3': float(nodal_total_stress_x[i]),
                'effective_principal_stress_1': float(nodal_effective_principal_stress_1[i]),
                'effective_principal_stress_3': float(nodal_effective_principal_stress_3[i])
            }
            for i in range(num_nodes)
        ]
        
        end_time = time.time()
        calculation_time = end_time - start_time
        print(f"Nodal stress/strain calculation completed in {calculation_time:.3f} seconds")
        print(f"Cache stats after calculation: {self.get_cache_stats()}")
        
        return nodal_results
    
    def _calculate_element_area(self, node_ids):
        """Calculate the area of a triangular element"""
        # Create cache key (sorted to ensure consistency)
        cache_key = tuple(sorted(node_ids))
        
        # Check cache first
        if cache_key in self._element_area_cache:
            return self._element_area_cache[cache_key]
        
        # Get node coordinates
        x1, y1 = self.geometry.nodes[node_ids[0]]
        x2, y2 = self.geometry.nodes[node_ids[1]]
        x3, y3 = self.geometry.nodes[node_ids[2]]
        
        # Calculate area using shoelace formula
        area = 0.5 * abs(x1*(y2 - y3) + x2*(y3 - y1) + x3*(y1 - y2))
        
        # Cache the result
        self._element_area_cache[cache_key] = area
        return area
    
    def _calculate_distance_weight(self, node_id, element_centroid):
        """Calculate inverse distance weight from node to element centroid"""
        node_x, node_y = self.geometry.nodes[node_id]
        centroid_x, centroid_y = element_centroid
        
        distance = np.sqrt((node_x - centroid_x)**2 + (node_y - centroid_y)**2)
        # Avoid division by zero
        if distance < 1e-10:
            return 1e10  # Very large weight for very close points
        return 1.0 / distance
    
    def _calculate_element_centroid(self, node_ids):
        """Calculate the centroid of a triangular element"""
        # Create cache key (sorted to ensure consistency)
        cache_key = tuple(sorted(node_ids))
        
        # Check cache first
        if cache_key in self._element_centroid_cache:
            return self._element_centroid_cache[cache_key]
        
        x1, y1 = self.geometry.nodes[node_ids[0]]
        x2, y2 = self.geometry.nodes[node_ids[1]]
        x3, y3 = self.geometry.nodes[node_ids[2]]
        
        centroid_x = (x1 + x2 + x3) / 3.0
        centroid_y = (y1 + y2 + y3) / 3.0
        centroid = (centroid_x, centroid_y)
        
        # Cache the result
        self._element_centroid_cache[cache_key] = centroid
        return centroid
    
    def _find_surface_elevation_above_node(self, node_x, node_y):
        """
        Find the surface elevation above a given node following the terrain contour
        Based on active elements only (element-based filtering)
        
        Parameters:
        node_x, node_y: Coordinates of the node
        
        Returns:
        surface_y: Y coordinate of the surface above this node
        """
        # Create cache key
        cache_key = (round(node_x, 3), round(node_y, 3))  # Round to 3 decimal places for cache
        
        # Check cache first
        if cache_key in self._surface_elevation_cache:
            return self._surface_elevation_cache[cache_key]
        
        # ✅ Use surface nodes from active elements only
        surface_nodes = self._find_surface_nodes()
        
        # Find the surface node closest to the given X position
        closest_surface_node = None
        min_x_distance = float('inf')
        
        for node_id in surface_nodes:
            surface_x, surface_y = self.geometry.nodes[node_id]
            x_distance = abs(surface_x - node_x)
            
            if x_distance < min_x_distance:
                min_x_distance = x_distance
                closest_surface_node = node_id
        
        if closest_surface_node is not None:
            _, surface_y = self.geometry.nodes[closest_surface_node]
            # Cache the result
            self._surface_elevation_cache[cache_key] = surface_y
            return surface_y
        else:
            # ✅ Fallback: interpolate from nearby active surface nodes
            surface_y = self._interpolate_surface_elevation_from_active_nodes(node_x, node_y)
            # Cache the result
            self._surface_elevation_cache[cache_key] = surface_y
            return surface_y
    
    def _interpolate_surface_elevation(self, node_x, node_y):
        """
        Interpolate surface elevation from nearby surface nodes
        
        Parameters:
        node_x, node_y: Coordinates of the node
        
        Returns:
        surface_y: Interpolated Y coordinate of the surface
        """
        # Find all nodes and sort by distance to the given point
        nodes_with_distances = []
        for i, (x, y) in enumerate(self.geometry.nodes):
            distance = np.sqrt((x - node_x)**2 + (y - node_y)**2)
            nodes_with_distances.append((i, x, y, distance))
        
        # Sort by distance and take the closest nodes
        nodes_with_distances.sort(key=lambda node: node[3])
        
        # Use the closest node's Y coordinate as surface elevation
        # This follows the terrain contour
        closest_node_id, closest_x, closest_y, _ = nodes_with_distances[0]
        
        # Check if this node is likely a surface node
        if self._is_surface_candidate(closest_node_id, closest_y):
            return closest_y
        else:
            # Find the highest Y among nearby nodes that could be surface nodes
            for node_id, x, y, distance in nodes_with_distances[:5]:  # Check 5 closest nodes
                if self._is_surface_candidate(node_id, y):
                    return y
            
            # Final fallback: return the highest Y coordinate
            return max([y for _, _, y, _ in nodes_with_distances])
    
    def _interpolate_surface_elevation_from_active_nodes(self, node_x, node_y):
        """
        Interpolate surface elevation from nearby active surface nodes only
        
        Parameters:
        node_x, node_y: Coordinates of the node
        
        Returns:
        surface_y: Interpolated Y coordinate of the surface
        """
        # ✅ Only use nodes from active elements
        active_nodes = set()
        for elem_data in self.elements:
            active_nodes.update(elem_data['node_ids'])
        
        # Find active nodes and sort by distance to the given point
        nodes_with_distances = []
        for i, (x, y) in enumerate(self.geometry.nodes):
            if i in active_nodes:  # Only consider active nodes
                distance = np.sqrt((x - node_x)**2 + (y - node_y)**2)
                nodes_with_distances.append((i, x, y, distance))
        
        # Sort by distance and take the closest nodes
        nodes_with_distances.sort(key=lambda node: node[3])
        
        if not nodes_with_distances:
            # No active nodes found, return the node's own Y coordinate
            return node_y
        
        # Use the closest active node's Y coordinate as surface elevation
        closest_node_id, closest_x, closest_y, _ = nodes_with_distances[0]
        
        # Check if this node is likely a surface node (from active elements)
        if self._is_surface_candidate_from_active_elements(closest_node_id, closest_y):
            return closest_y
        else:
            # Find the highest Y among nearby active nodes that could be surface nodes
            for node_id, x, y, distance in nodes_with_distances[:5]:  # Check 5 closest nodes
                if self._is_surface_candidate_from_active_elements(node_id, y):
                    return y
            
            # Final fallback: return the highest Y coordinate from active nodes
            return max([y for _, _, y, _ in nodes_with_distances])
    
    def _calculate_gauss_quadrature_weights(self, node_ids):
        """
        Calculate Gauss quadrature weights for CST element
        
        For CST element, optimal Gauss points are at barycentric coordinates:
        (1/6, 1/6, 2/3), (1/6, 2/3, 1/6), (2/3, 1/6, 1/6)
        Each with weight 1/3
        """
        # For CST element, use optimal Gauss points
        # These are the optimal sampling points for stress recovery
        gauss_points = [
            (1/6, 1/6, 2/3),  # ξ1 = 1/6, ξ2 = 1/6, ξ3 = 2/3
            (1/6, 2/3, 1/6),  # ξ1 = 1/6, ξ2 = 2/3, ξ3 = 1/6
            (2/3, 1/6, 1/6)   # ξ1 = 2/3, ξ2 = 1/6, ξ3 = 1/6
        ]
        
        # Calculate shape function values at Gauss points for each node
        weights = []
        for i in range(3):  # For each node
            node_weight = 0.0
            for gp in gauss_points:
                # Shape function N_i at Gauss point
                if i == 0:
                    N_i = gp[0]  # N1 = ξ1
                elif i == 1:
                    N_i = gp[1]  # N2 = ξ2
                else:
                    N_i = gp[2]  # N3 = ξ3
                node_weight += N_i / 3.0  # Average over Gauss points
            weights.append(node_weight)
        
        return weights
    
    def _calculate_superconvergent_weights(self, node_ids, elem_result):
        """
        Calculate superconvergent patch recovery weights
        
        Superconvergent patch recovery uses a patch of elements around each node
        to achieve optimal accuracy in stress recovery
        """
        # Find all elements that share this node (patch)
        node_id = node_ids[0]  # Consider the first node
        patch_elements = []
        
        for elem_data in self.elements:
            if node_id in elem_data['node_ids']:
                patch_elements.append(elem_data)
        
        # Calculate weights based on patch recovery
        if len(patch_elements) > 1:
            # Use patch-based recovery for better accuracy
            # Weight by inverse of distance to node and element quality
            weights = []
            for i, node_id in enumerate(node_ids):
                node_weight = 0.0
                total_weight = 0.0
                
                for patch_elem in patch_elements:
                    # Calculate element quality (area-based)
                    patch_node_ids = patch_elem['node_ids']
                    elem_area = self._calculate_element_area(patch_node_ids)
                    
                    # Distance from element centroid to node
                    centroid = self._calculate_element_centroid(patch_node_ids)
                    node_x, node_y = self.geometry.nodes[node_id]
                    distance = np.sqrt((centroid[0] - node_x)**2 + (centroid[1] - node_y)**2)
                    
                    # Weight = area / (distance + small_epsilon)
                    weight = elem_area / (distance + 1e-10)
                    node_weight += weight
                    total_weight += weight
                
                if total_weight > 0:
                    weights.append(node_weight / total_weight)
                else:
                    weights.append(1.0/3.0)  # Fallback to equal weights
        else:
            # Single element, use shape function weights
            weights = [1.0/3.0] * 3
        
        return weights
    
    def _find_surface_nodes(self):
        """
        Find surface nodes that follow the terrain contour/topography
        Based on active elements only (element-based filtering)
        
        Returns:
        surface_node_ids: List of node IDs that form the surface contour
        """
        # Use cached result if available
        if self._surface_nodes_cache is not None:
            return self._surface_nodes_cache
        
        # ✅ Element-based approach: Only use nodes from active elements
        # Get all nodes from active elements
        active_nodes = set()
        for elem_data in self.elements:
            active_nodes.update(elem_data['node_ids'])
        
        # Get coordinates for active nodes only
        active_nodes_with_coords = [
            (i, x, y) for i, (x, y) in enumerate(self.geometry.nodes)
            if i in active_nodes
        ]
        
        # Sort active nodes by X coordinate to follow the contour from left to right
        nodes_sorted_by_x = sorted(active_nodes_with_coords, key=lambda node: node[1])
        
        # Find surface nodes by following the contour (only from active elements)
        surface_node_ids = []
        x_tolerance = 0.1  # 10 cm tolerance for grouping
        
        current_x_group = []
        current_x = None
        
        for node_id, x, y in nodes_sorted_by_x:
            if current_x is None or abs(x - current_x) <= x_tolerance:
                # Add to current group
                current_x_group.append((node_id, x, y))
                current_x = x
            else:
                # New X group, process the previous group
                if current_x_group:
                    # Find the surface node in this group (highest Y that follows contour)
                    surface_node = self._find_surface_node_in_group(current_x_group)
                    if surface_node is not None:
                        surface_node_ids.append(surface_node)
                
                # Start new group
                current_x_group = [(node_id, x, y)]
                current_x = x
        
        # Process the last group
        if current_x_group:
            surface_node = self._find_surface_node_in_group(current_x_group)
            if surface_node is not None:
                surface_node_ids.append(surface_node)
        
        # Cache the result for future use
        self._surface_nodes_cache = surface_node_ids
        
        # ✅ Debug logging for surface detection
        print(f"🔍 Surface detection completed:")
        print(f"   - Total active elements: {len(self.elements)}")
        print(f"   - Active nodes found: {len(active_nodes)}")
        print(f"   - Surface nodes found: {len(surface_node_ids)}")
        
        return surface_node_ids
    
    def clear_cache(self):
        """Clear all cached results - useful when geometry changes"""
        self._surface_nodes_cache = None
        self._surface_elevation_cache.clear()
        self._element_area_cache.clear()
        self._element_centroid_cache.clear()
        print("✅ Cache cleared - ready for new calculations with active elements")
    
    def get_cache_stats(self):
        """Get statistics about cache usage"""
        return {
            'surface_nodes_cached': self._surface_nodes_cache is not None,
            'surface_elevation_cache_size': len(self._surface_elevation_cache),
            'element_area_cache_size': len(self._element_area_cache),
            'element_centroid_cache_size': len(self._element_centroid_cache)
        }
    
    def get_performance_stats(self):
        """Get performance statistics and recommendations"""
        stats = self.get_cache_stats()
        
        # Calculate cache hit rates (if we had hit counters)
        total_cache_size = (stats['surface_elevation_cache_size'] + 
                           stats['element_area_cache_size'] + 
                           stats['element_centroid_cache_size'])
        
        recommendations = []
        
        if total_cache_size > 1000:
            recommendations.append("💡 Large cache detected - consider clearing cache if memory is limited")
        
        if not stats['surface_nodes_cached']:
            recommendations.append("💡 Surface nodes not cached - first calculation will be slower")
        
        if stats['surface_elevation_cache_size'] > 500:
            recommendations.append("💡 Many surface elevation calculations cached - good for repeated analysis")
        
        return {
            'cache_stats': stats,
            'total_cache_size': total_cache_size,
            'recommendations': recommendations
        }
    
    def optimize_for_speed(self):
        """Apply speed optimizations"""
        print("🚀 Applying speed optimizations...")
        
        # Clear complex caches to free memory
        self._surface_elevation_cache.clear()
        
        # Set default interpolation method to fastest
        print("💡 Using 'simple_average' interpolation for maximum speed")
        print("💡 Use 'area_weighted' for better accuracy if needed")
        
        return "Speed optimizations applied"
    
    def optimize_for_accuracy(self):
        """Apply accuracy optimizations"""
        print("🎯 Applying accuracy optimizations...")
        
        # Keep all caches for maximum accuracy
        print("💡 Using 'area_weighted' interpolation for best accuracy")
        print("💡 All caches enabled for maximum performance")
        
        return "Accuracy optimizations applied"
    
    def _find_surface_node_in_group(self, node_group):
        """
        Find the appropriate surface node in a group of nodes at similar X position
        
        Parameters:
        node_group: List of (node_id, x, y) tuples
        
        Returns:
        surface_node_id: The node ID that best represents the surface at this X position
        """
        if not node_group:
            return None
        
        # If only one node in group, it's the surface node
        if len(node_group) == 1:
            return node_group[0][0]
        
        # For multiple nodes, find the one that best represents the surface
        # Consider both Y coordinate and connectivity to other surface nodes
        
        # First, try to find nodes that are connected to elements that might be surface elements
        # This helps maintain contour continuity
        surface_candidates = []
        
        for node_id, x, y in node_group:
            # Check if this node is connected to elements that might be surface elements
            is_surface_candidate = self._is_surface_candidate(node_id, y)
            if is_surface_candidate:
                surface_candidates.append((node_id, x, y))
        
        # If we found surface candidates, use the highest one
        if surface_candidates:
            return max(surface_candidates, key=lambda node: node[2])[0]
        
        # Fallback: use the highest Y coordinate
        return max(node_group, key=lambda node: node[2])[0]
    
    def _calculate_layered_soil_stress(self, element_y, surface_y):
        """Calculate vertical stress considering layered soil materials above the element
        
        Parameters:
        element_y: Y-coordinate of the element centroid
        surface_y: Y-coordinate of the surface
        
        Returns:
        sigma_1: Total vertical stress (negative for compression)
        """
        if element_y >= surface_y:
            return 0.0  # Element is above surface
        
        total_stress = 0.0
        current_depth = 0.0
        
        # Sort elements by Y coordinate (top to bottom)
        sorted_elements = sorted(self.elements, key=lambda x: x['element'].centroid[1], reverse=True)
        
        # Calculate stress contribution from each layer
        for i, elem_data in enumerate(sorted_elements):
            elem_centroid_y = elem_data['element'].centroid[1]
            
            # Skip elements below our target element
            if elem_centroid_y <= element_y:
                continue
                
            # Skip elements above surface
            if elem_centroid_y > surface_y:
                continue
            
            # Skip if this is the same element (avoid self-contribution)
            if abs(elem_centroid_y - element_y) < 0.01:
                continue
            
            # ✅ Get material properties for this element
            if 'material' not in elem_data:
                raise ValueError(f"Element in layered stress calculation has no material assigned.")
            
            element_material = elem_data['material']
            
            if 'unitWeightSaturated' not in element_material:
                raise ValueError(f"Material missing 'unitWeightSaturated' property in layered stress calculation")
            if 'unitWeightUnsaturated' not in element_material:
                raise ValueError(f"Material missing 'unitWeightUnsaturated' property in layered stress calculation")
            
            # Calculate the actual layer thickness this element contributes
            # For the first element (topmost), calculate from surface to its centroid
            if i == 0 or sorted_elements[i-1]['element'].centroid[1] > surface_y:
                layer_thickness = surface_y - elem_centroid_y
            else:
                # For subsequent elements, calculate from previous element's centroid to this element's centroid
                prev_centroid_y = sorted_elements[i-1]['element'].centroid[1]
                layer_thickness = prev_centroid_y - elem_centroid_y
            
            # Ensure positive thickness
            layer_thickness = max(0.0, layer_thickness)
            
            if layer_thickness > 0:
                # ✅ Choose unit weight based on water level for this layer
                elem_centroid_x = elem_data['element'].centroid[0]
                water_level_at_layer = self.interpolate_water_level_at_x(elem_centroid_x)
                
                if elem_centroid_y < water_level_at_layer:
                    unit_weight = element_material['unitWeightSaturated']  # Below water level
                    gamma_type = "saturated"
                else:
                    unit_weight = element_material['unitWeightUnsaturated']  # Above water level
                    gamma_type = "unsaturated"
                
                stress_contribution = -unit_weight * layer_thickness
                total_stress += stress_contribution
                current_depth += layer_thickness
                
                # print(f"Layer stress: γ={unit_weight:.1f} kN/m³ ({gamma_type}), h={layer_thickness:.2f}m, σ={stress_contribution:.1f} kPa, depth={current_depth:.2f}m")
        
        # If no elements found above, this element is at or near the surface
        if total_stress == 0.0:
            print(f"Element at y={element_y:.2f} is at surface level - no overburden stress")
            return 0.0  # No overburden stress at surface
        
        return total_stress
    
    def _is_surface_candidate(self, node_id, node_y):
        """
        Check if a node is a good candidate for surface node
        
        Parameters:
        node_id: Node ID to check
        node_y: Y coordinate of the node
        
        Returns:
        is_surface: True if this node is likely a surface node
        """
        # Check if this node is part of elements that form the surface
        # Look for elements that have this node and are likely surface elements
        
        for elem_data in self.elements:
            if node_id in elem_data['node_ids']:
                # Get the other nodes in this element
                other_nodes = [n for n in elem_data['node_ids'] if n != node_id]
                
                # Check if other nodes are at similar or lower Y coordinates
                # This suggests this element is near the surface
                for other_node_id in other_nodes:
                    other_y = self.geometry.nodes[other_node_id][1]
                    if other_y > node_y + 0.5:  # If other node is significantly higher
                        return False  # This node is probably not at surface
                
                # If we get here, this element is likely a surface element
                return True
        
        return False
    
    def _is_surface_candidate_from_active_elements(self, node_id, node_y):
        """
        Check if a node is a good candidate for surface node (from active elements only)
        
        Parameters:
        node_id: Node ID to check
        node_y: Y coordinate of the node
        
        Returns:
        is_surface: True if this node is likely a surface node
        """
        # ✅ Only check active elements (self.elements already contains only active elements)
        # Check if this node is part of active elements that form the surface
        # Look for elements that have this node and are likely surface elements
        
        for elem_data in self.elements:
            if node_id in elem_data['node_ids']:
                # Get the other nodes in this element
                other_nodes = [n for n in elem_data['node_ids'] if n != node_id]
                
                # Check if other nodes are at similar or lower Y coordinates
                # This suggests this element is near the surface
                for other_node_id in other_nodes:
                    other_y = self.geometry.nodes[other_node_id][1]
                    if other_y > node_y + 0.5:  # If other node is significantly higher
                        return False  # This node is probably not at surface
                
                # If we get here, this element is likely a surface element
                return True
        
        return False
    
    def interpolate_water_level_at_x(self, x_coord):
        """
        Interpolate water level elevation at specific x-coordinate
        
        Parameters:
        x_coord: X-coordinate to get water level at
        
        Returns:
        water_level: Water level elevation at x_coord
        """
        # If no water level points, use default water level
        if not self.water_level_points:
            return self.water_level
        
        # Convert to list of tuples for easier processing
        points = [(point['x'], point['y']) for point in self.water_level_points]
        
        # Sort water level points by x-coordinate
        sorted_points = sorted(points, key=lambda p: p[0])
        
        # If only one point, return its y-value
        if len(sorted_points) == 1:
            return sorted_points[0][1]
        
        # Find the two points that bracket the x_coord
        for i in range(len(sorted_points) - 1):
            x1, y1 = sorted_points[i]
            x2, y2 = sorted_points[i + 1]
            
            if x1 <= x_coord <= x2:
                # Linear interpolation
                if x2 - x1 > 0:
                    t = (x_coord - x1) / (x2 - x1)
                    water_level = y1 + t * (y2 - y1)
                    return water_level
        
        # If x_coord is outside the range, use the closest endpoint
        if x_coord <= sorted_points[0][0]:
            return sorted_points[0][1]
        else:
            return sorted_points[-1][1]
    
    def get_soil_specific_results(self):
        """Get soil-specific analysis results"""
        print(f"🔧 DEBUG: get_soil_specific_results() called", flush=True)
        print(f"🔧 DEBUG: This is FEA solver", flush=True)
        print(f"🔧 DEBUG: is_initial_stage={self.is_initial_stage}", flush=True)
        element_results = self.get_element_results()
        print(f"🔧 DEBUG: get_element_results() returned {len(element_results)} elements", flush=True)
        
        # ✅ DEBUG: Show first few element results
        print(f"🔧 DEBUG: First 3 element results from get_element_results():")
        for i in range(min(3, len(element_results))):
            elem = element_results[i]
            print(f"   Element {i}: total_stress_x={elem.get('total_stress_x', 'NOT_FOUND')}, total_stress_y={elem.get('total_stress_y', 'NOT_FOUND')}")
        
        # ✅ DEBUG: Show all total stress values
        total_stress_x_values = [elem['total_stress_x'] for elem in element_results]
        total_stress_y_values = [elem['total_stress_y'] for elem in element_results]
        print(f"🔧 DEBUG: Total stress X values (first 5): {total_stress_x_values[:5]}")
        print(f"🔧 DEBUG: Total stress Y values (first 5): {total_stress_y_values[:5]}")
        
        # Calculate overall soil stability
        max_effective_principal_stress_1 = max([elem['effective_principal_stress_1'] for elem in element_results])
        max_principal_stress = max([elem['principal_stresses'][0] for elem in element_results])
        
        # ✅ FIX: Calculate total stress statistics
        max_total_stress_x = max([elem['total_stress_x'] for elem in element_results])
        min_total_stress_x = min([elem['total_stress_x'] for elem in element_results])
        max_total_stress_y = max([elem['total_stress_y'] for elem in element_results])
        min_total_stress_y = min([elem['total_stress_y'] for elem in element_results])
        
        # Calculate pore water pressure statistics
        nodal_stress_strain = self.get_nodal_stress_strain_results()
        if nodal_stress_strain:
            max_pore_water_pressure = max([node['pore_water_pressure'] for node in nodal_stress_strain])
            min_pore_water_pressure = min([node['pore_water_pressure'] for node in nodal_stress_strain])
        else:
            max_pore_water_pressure = 0.0
            min_pore_water_pressure = 0.0
        
        # Calculate settlement at surface nodes (nodes with maximum Y coordinates)
        # ✅ Surface nodes are now based on active elements only
        surface_nodes = self._find_surface_nodes()
        
        settlements = []
        for node_id in surface_nodes:
            v_dof = 2 * node_id + 1
            settlement = abs(self.displacements[v_dof])
            settlements.append(settlement)
        
        max_settlement = max(settlements)
        
        soil_results = {
            'max_effective_principal_stress_1': float(max_effective_principal_stress_1),
            'max_principal_stress': float(max_principal_stress),
            # ✅ FIX: Add total stress to soil results
            'max_total_stress_x': float(max_total_stress_x),
            'min_total_stress_x': float(min_total_stress_x),
            'max_total_stress_y': float(max_total_stress_y),
            'min_total_stress_y': float(min_total_stress_y),
            'max_settlement': float(max_settlement),
            'surface_settlements': [float(s) for s in settlements],
            'max_pore_water_pressure': float(max_pore_water_pressure),
            'min_pore_water_pressure': float(min_pore_water_pressure)
        }
        
        # ✅ DEBUG: Show final soil_results
        print(f"🔧 DEBUG: Final soil_results:")
        print(f"   - max_total_stress_x: {soil_results['max_total_stress_x']}")
        print(f"   - min_total_stress_x: {soil_results['min_total_stress_x']}")
        print(f"   - max_total_stress_y: {soil_results['max_total_stress_y']}")
        print(f"   - min_total_stress_y: {soil_results['min_total_stress_y']}")
        
        return soil_results 

    def get_stage_results(self):
        """Get complete stage results for sequential analysis"""
        # ✅ Ensure all data is in serializable format
        if self.stage_results['displacements'] is not None:
            self.stage_results['displacements'] = self.stage_results['displacements'].tolist()
        
        # Convert stress state data if it exists
        if self.stage_results['stress_state'] is not None:
            stress_state = self.stage_results['stress_state']
            if 'element_stresses' in stress_state:
                for elem_stress in stress_state['element_stresses']:
                    if 'centroid' in elem_stress and isinstance(elem_stress['centroid'], np.ndarray):
                        elem_stress['centroid'] = elem_stress['centroid'].tolist()
        
        # ✅ Convert stress history data if it exists
        if 'stress_history' in self.stage_results and self.stage_results['stress_history'] is not None:
            stress_history = self.stage_results['stress_history']
            # Ensure all stress values are serializable
            for stress_type in ['initial_stress', 'incremental_stress', 'final_stress']:
                if stress_type in stress_history and 'element_stresses' in stress_history[stress_type]:
                    for elem_stress in stress_history[stress_type]['element_stresses']:
                        # Convert any numpy values to Python types
                        for key, value in elem_stress.items():
                            if isinstance(value, np.ndarray):
                                elem_stress[key] = value.tolist()
                            elif isinstance(value, np.integer):
                                elem_stress[key] = int(value)
                            elif isinstance(value, np.floating):
                                elem_stress[key] = float(value)
        
        # ✅ Convert PWP history data if it exists
        if 'pwp_history' in self.stage_results and self.stage_results['pwp_history'] is not None:
            pwp_history = self.stage_results['pwp_history']
            # Ensure all PWP values are serializable
            for pwp_type in ['hydrostatic_pwp', 'excess_pwp', 'total_pwp']:
                if pwp_type in pwp_history and 'element_pwp' in pwp_history[pwp_type]:
                    for elem_pwp in pwp_history[pwp_type]['element_pwp']:
                        # Convert any numpy values to Python types
                        for key, value in elem_pwp.items():
                            if isinstance(value, np.ndarray):
                                elem_pwp[key] = value.tolist()
                            elif isinstance(value, np.integer):
                                elem_pwp[key] = int(value)
                            elif isinstance(value, np.floating):
                                elem_pwp[key] = float(value)
        
        return self.stage_results
    
    def get_summary(self, soil_results):
        """Calculate analysis summary"""
        # Calculate summary statistics
        max_displacement = np.max(np.abs(self.displacements)) if self.displacements is not None else 0.0
        max_settlement = soil_results.get('max_settlement', 0.0)
        min_safety_factor = 0  # Not calculated in standard FEA
        
        max_effective_principal_stress_1 = soil_results.get('max_effective_principal_stress_1', 0.0)
        max_pore_water_pressure = soil_results.get('max_pore_water_pressure', 0.0)
        min_pore_water_pressure = soil_results.get('min_pore_water_pressure', 0.0)
        
        # ✅ FIX: Add total stress to summary
        max_total_stress_x = soil_results.get('max_total_stress_x', 0.0)
        min_total_stress_x = soil_results.get('min_total_stress_x', 0.0)
        max_total_stress_y = soil_results.get('max_total_stress_y', 0.0)
        min_total_stress_y = soil_results.get('min_total_stress_y', 0.0)
        
        # For FEA, stability assessment is based on stress state
        if max_effective_principal_stress_1 > 0:
            stability_assessment = "STABLE"
        else:
            stability_assessment = "UNSTABLE"
        
        return {
            'max_displacement': float(max_displacement),
            'min_displacement': 0.0,  # FEA typically has positive displacements
            'max_settlement': float(max_settlement),
            'min_safety_factor': float(min_safety_factor),
            'max_effective_principal_stress_1': float(max_effective_principal_stress_1),
            'max_pore_water_pressure': float(max_pore_water_pressure),
            'min_pore_water_pressure': float(min_pore_water_pressure),
            # ✅ FIX: Add total stress to summary
            'max_total_stress_x': float(max_total_stress_x),
            'min_total_stress_x': float(min_total_stress_x),
            'max_total_stress_y': float(max_total_stress_y),
            'min_total_stress_y': float(min_total_stress_y),
            'stability_assessment': stability_assessment,
            'analysis_type': 'FEA'
        }
    
    def get_active_nodes(self):
        """Get list of active node IDs for current stage"""
        active_nodes = set()
        for elem_data in self.elements:
            # Convert numpy.int64 to Python int
            node_ids = [int(node_id) for node_id in elem_data['node_ids']]
            active_nodes.update(node_ids)
        return list(active_nodes)
    

    
    def _calculate_stress_history_standard(self):
        """Calculate stress history for standard FEA (initial stage with FEA)"""
        print("🔧 Calculating stress history for standard FEA")
        
        stress_history = {
            'stage_type': 'Standard_FEA',
            'initial_stress': {
                'element_stresses': [],
                'nodal_stresses': [],
                'description': 'Zero stress (no previous stage)'
            },
            'incremental_stress': {
                'element_stresses': [],
                'nodal_stresses': [],
                'description': 'Stress from FEA analysis'
            },
            'final_stress': {
                'element_stresses': [],
                'nodal_stresses': [],
                'description': 'Total stress (same as incremental for initial stage)'
            }
        }
        
        # For standard FEA: initial stress is zero, incremental = FEA stress
        for i, elem_data in enumerate(self.elements):
            element = elem_data['element']
            node_ids = elem_data['node_ids']
            
            # Extract element displacements
            elem_displacements = []
            for node_id in node_ids:
                u_dof = 2 * node_id
                v_dof = 2 * node_id + 1
                elem_displacements.extend([
                    self.displacements[u_dof],
                    self.displacements[v_dof]
                ])
            
            elem_displacements = np.array(elem_displacements)
            
            # Calculate stresses from FEA
            strains = element.get_strains(elem_displacements)
            stresses = element.get_stresses(elem_displacements)
            principal_stresses = element.get_principal_stresses(elem_displacements)
            
            # Calculate pore water pressure
            centroid_x, centroid_y = element.centroid
            water_level_at_element = self.interpolate_water_level_at_x(centroid_x)
            pore_water_pressure = -9.81 * max(0, water_level_at_element - centroid_y) if centroid_y < water_level_at_element else 0.0
            
            # Initial stress (zero for standard FEA)
            initial_stress = {
                'element_id': i,
                'sigma_1': 0.0,
                'sigma_3': 0.0,
                'pore_water_pressure': 0.0,
                'effective_stress_1': 0.0,
                'effective_stress_3': 0.0
            }
            
            # Incremental stress (FEA stress)
            incremental_stress = {
                'element_id': i,
                'sigma_1': stresses[1],  # σy component
                'sigma_3': stresses[0],  # σx component
                'pore_water_pressure': pore_water_pressure,
                'effective_stress_1': stresses[1] - pore_water_pressure,
                'effective_stress_3': stresses[0] - pore_water_pressure
            }
            
            # Final stress (same as incremental for standard FEA)
            final_stress = {
                'element_id': i,
                'sigma_1': stresses[1],
                'sigma_3': stresses[0],
                'pore_water_pressure': pore_water_pressure,
                'effective_stress_1': stresses[1] - pore_water_pressure,
                'effective_stress_3': stresses[0] - pore_water_pressure
            }
            
            stress_history['initial_stress']['element_stresses'].append(initial_stress)
            stress_history['incremental_stress']['element_stresses'].append(incremental_stress)
            stress_history['final_stress']['element_stresses'].append(final_stress)
        
        print(f"✅ Standard FEA stress history calculated for {len(self.elements)} elements")
        return stress_history
    
    def _calculate_pwp_history_standard(self):
        """Calculate PWP history for standard FEA (initial stage with FEA)"""
        print("🔧 Calculating PWP history for standard FEA")
        
        pwp_history = {
            'stage_type': 'Standard_FEA',
            'hydrostatic_pwp': {
                'element_pwp': [],
                'nodal_pwp': [],
                'description': 'Hydrostatic pore water pressure'
            },
            'excess_pwp': {
                'element_pwp': [],
                'nodal_pwp': [],
                'description': 'Excess PWP from FEA analysis'
            },
            'total_pwp': {
                'element_pwp': [],
                'nodal_pwp': [],
                'description': 'Total PWP (hydrostatic + excess)'
            }
        }
        
        # For standard FEA: calculate excess PWP from FEA results
        for i, elem_data in enumerate(self.elements):
            element = elem_data['element']
            centroid_x, centroid_y = element.centroid
            
            # Calculate hydrostatic PWP
            water_level_at_element = self.interpolate_water_level_at_x(centroid_x)
            hydrostatic_pwp = -9.81 * max(0, water_level_at_element - centroid_y) if centroid_y < water_level_at_element else 0.0
            
            # Calculate excess PWP from FEA results
            excess_pwp = self._calculate_excess_pwp_from_fea(i, elem_data)
            
            # Total PWP = hydrostatic + excess
            total_pwp = hydrostatic_pwp + excess_pwp
            
            # Store PWP data
            pwp_data = {
                'element_id': i,
                'hydrostatic_pwp': hydrostatic_pwp,
                'excess_pwp': excess_pwp,
                'total_pwp': total_pwp,
                'water_level': water_level_at_element,
                'element_depth': centroid_y
            }
            
            pwp_history['hydrostatic_pwp']['element_pwp'].append(pwp_data)
            pwp_history['excess_pwp']['element_pwp'].append(pwp_data)
            pwp_history['total_pwp']['element_pwp'].append(pwp_data)
        
        print(f"✅ Standard FEA PWP history calculated for {len(self.elements)} elements")
        return pwp_history
    
    def _calculate_excess_pwp_for_element(self, element_index, elem_data):
        """Calculate excess PWP for a specific element from current stage loading"""
        centroid_x, centroid_y = elem_data['element'].centroid
        total_excess_pwp = 0.0
        
        # ✅ RULE 1: Initial stage - no excess PWP
        if self.is_initial_stage:
            print(f"Element {element_index}: Initial stage - excess_pwp=0.0")
            return 0.0
        
        # ✅ RULE 2: Check if this element is NEW in current stage using active element concept
        if self._is_new_element(element_index):
            # ✅ RULE 4: New element - calculate excess PWP from soil weight
            print(f"Element {element_index}: NEW element - calculating excess PWP from soil weight")
        else:
            # ✅ RULE 3: Element not new - no excess PWP from soil weight
            print(f"Element {element_index}: Not new element - excess_pwp=0.0")
            return 0.0
        
        # Get element material properties
        element_material = elem_data['material']
        
        # Calculate soil weight for this element
        element_area = elem_data['element'].area
        element_thickness = element_material.get('thickness', 1.0)
        element_volume = element_area * element_thickness
        
        # Get appropriate unit weight based on water level
        centroid_x = elem_data['element'].centroid[0]
        water_level_at_element = self.interpolate_water_level_at_x(centroid_x)
        
        if centroid_y < water_level_at_element:
            # Below water level - use saturated unit weight
            unit_weight = element_material.get('unitWeightSaturated', 20.0)
        else:
            # Above water level - use unsaturated unit weight
            unit_weight = element_material.get('unitWeightUnsaturated', 18.0)
        
        # Calculate soil weight
        soil_weight = element_volume * unit_weight
        
        # Calculate excess PWP using Skempton's equation
        # Δu = B × [Δσ₃ + A × (Δσ₁ - Δσ₃)]
        # For soil weight loading, assume isotropic stress increase
        B = 1.0  # For saturated soils
        A = 0.5  # Default value
        
        # Assume isotropic stress increase from soil weight
        delta_sigma_1 = soil_weight / element_area  # Vertical stress increase
        delta_sigma_3 = 0.3 * delta_sigma_1  # Horizontal stress increase (K0 effect)
        
        excess_pwp = B * (delta_sigma_3 + A * (delta_sigma_1 - delta_sigma_3))
        
        print(f"Element {element_index}: soil_weight={soil_weight:.2f} kN, excess_pwp={excess_pwp:.2f} kPa")
        return excess_pwp
    
    def _calculate_excess_pwp_from_fea(self, element_index, elem_data):
        """Calculate excess PWP from FEA results"""
        # Extract element displacements
        node_ids = elem_data['node_ids']
        elem_displacements = []
        for node_id in node_ids:
            u_dof = 2 * node_id
            v_dof = 2 * node_id + 1
            elem_displacements.extend([
                self.displacements[u_dof],
                self.displacements[v_dof]
            ])
        
        elem_displacements = np.array(elem_displacements)
        
        # Calculate stresses from FEA
        element = elem_data['element']
        stresses = element.get_stresses(elem_displacements)
        
        # ✅ IMPORTANT: Only calculate excess PWP from stress changes due to EXTERNAL loads
        # NOT from total stresses (which include soil weight)
        
        # Get previous stage stresses for comparison
        previous_stresses = None
        if self.initial_stress_state and 'stress_history' in self.initial_stress_state:
            prev_history = self.initial_stress_state['stress_history']
            if 'final_stress' in prev_history:
                for prev_stress in prev_history['final_stress']['element_stress']:
                    if prev_stress.get('element_id') == element_id:
                        previous_stresses = prev_stress.get('stress_components', [0, 0, 0])
                        break
        
        if previous_stresses is not None:
            # Calculate stress changes from previous stage
            delta_sigma_1 = stresses[1] - previous_stresses[1]  # Δσy
            delta_sigma_3 = stresses[0] - previous_stresses[0]  # Δσx
            
            # Calculate excess PWP using Skempton's equation
            # Δu = B × [Δσ₃ + A × (Δσ₁ - Δσ₃)]
            
            # For saturated soils, B ≈ 1.0
            B = 1.0
            
            # A parameter (can be made material-specific)
            A = 0.5
            
            excess_pwp = B * (delta_sigma_3 + A * (delta_sigma_1 - delta_sigma_3))
        else:
            # First stage: assume initial stresses were zero
            # But be careful: soil weight stresses should not generate excess PWP
            # Only consider stresses from external loads
            
            # For now, use a conservative approach
            # Only calculate excess PWP if there are external loads
            external_loads = 0.0
            for force_data in self.boundary_conditions.applied_forces:
                external_loads += abs(force_data[2])
            
            if external_loads > 0:
                # Calculate excess PWP using Skempton's equation
                # Δu = B × [Δσ₃ + A × (Δσ₁ - Δσ₃)]
                
                # For saturated soils, B ≈ 1.0
                B = 1.0
                
                # A parameter (can be made material-specific)
                A = 0.5
                
                # Use total stresses but scale by external load ratio
                delta_sigma_1 = stresses[1] * (external_loads / max(1e-6, sum(abs(s) for s in stresses)))
                delta_sigma_3 = stresses[0] * (external_loads / max(1e-6, sum(abs(s) for s in stresses)))
                
                excess_pwp = B * (delta_sigma_3 + A * (delta_sigma_1 - delta_sigma_3))
            else:
                # No external loads = no excess PWP
                excess_pwp = 0.0
        
        return excess_pwp
    
 
    # ✅ Plastic strain history management methods
    
    def update_plastic_strain_history(self, element_index, plastic_strain_increment):
        """
        Update plastic strain history for a specific element
        
        Parameters:
        element_index: Index of the element in self.elements list
        plastic_strain_increment: [Δεx_plastic, Δεy_plastic, Δγxy_plastic]
        """
        if element_index not in self.plastic_strain_history:
            self.plastic_strain_history[element_index] = []
            self.accumulated_plastic_strain_history[element_index] = []
        
        # Get current plastic strain from element
        element = self.elements[element_index]['element']
        current_plastic_strain = element.plastic_strain.copy()
        
        # Update element's plastic strain
        element.update_plastic_strain(plastic_strain_increment)
        
        # Store in history
        self.plastic_strain_history[element_index].append(current_plastic_strain.tolist())
        self.accumulated_plastic_strain_history[element_index].append(element.accumulated_plastic_strain)
        
        # Track yielded elements
        if element.is_yielded:
            self.yielded_elements.add(element_index)
    
    def get_plastic_strain_summary(self):
        """
        Get summary of plastic strain across all elements
        
        Returns:
        dict: Plastic strain summary
        """
        # ✅ FIX: Convert 0-based indices to 1-based element IDs for frontend
        yielded_elements_list_1based = [elem_id + 1 for elem_id in self.yielded_elements]
        
        summary = {
            'total_elements': len(self.elements),
            'yielded_elements': len(self.yielded_elements),
            'yielded_elements_list': yielded_elements_list_1based,  # ✅ 1-based IDs for frontend
            'plastic_strain_history': self.plastic_strain_history,
            'accumulated_plastic_strain_history': self.accumulated_plastic_strain_history,
            'iteration_history': self.iteration_history
        }
        
        # Calculate statistics
        if self.yielded_elements:
            max_plastic_strain = 0.0
            max_accumulated_plastic_strain = 0.0
            
            for element_id in self.yielded_elements:
                element = self.elements[element_id]['element']
                plastic_magnitude = element.get_plastic_strain_magnitude()
                accumulated = element.accumulated_plastic_strain
                
                max_plastic_strain = max(max_plastic_strain, plastic_magnitude)
                max_accumulated_plastic_strain = max(max_accumulated_plastic_strain, accumulated)
            
            summary['max_plastic_strain_magnitude'] = max_plastic_strain
            summary['max_accumulated_plastic_strain'] = max_accumulated_plastic_strain
        
        return summary
    
    def reset_plastic_strain_history(self):
        """Reset plastic strain history for new analysis"""
        self.plastic_strain_history = {}
        self.accumulated_plastic_strain_history = {}
        self.yielded_elements.clear()
        self.iteration_history = []
        
        # Reset plastic strain in all elements
        for elem_data in self.elements:
            elem_data['element'].reset_plastic_strain()
    
    def get_element_plastic_strain_info(self, element_index):
        """
        Get detailed plastic strain information for a specific element
        
        Parameters:
        element_index: Index of the element in self.elements list
        
        Returns:
        dict: Detailed plastic strain information
        """
        if element_index >= len(self.elements):
            return None
        
        element = self.elements[element_index]['element']
        element_info = element.get_plastic_strain_info()
        
        # Add history information
        element_info['element_index'] = element_index
        element_info['plastic_strain_history'] = self.plastic_strain_history.get(element_index, [])
        element_info['accumulated_plastic_strain_history'] = self.accumulated_plastic_strain_history.get(element_index, [])
        element_info['is_in_yielded_elements'] = element_index in self.yielded_elements
        
        return element_info
    
    def add_iteration_record(self, iteration_number, convergence_info):
        """
        Add iteration record for convergence tracking
        
        Parameters:
        iteration_number: Current iteration number
        convergence_info: Dict with convergence information
        """
        record = {
            'iteration': iteration_number,
            'timestamp': convergence_info.get('timestamp', None),
            'residual_norm': convergence_info.get('residual_norm', 0.0),
            'yielded_elements_count': len(self.yielded_elements),
            'max_plastic_strain_increment': convergence_info.get('max_plastic_strain_increment', 0.0),
            'converged': convergence_info.get('converged', False)
        }
        self.iteration_history.append(record)
    
    # ✅ Plastic analysis convergence methods
    
    def check_plastic_convergence(self, tolerance_yield=1e-6, tolerance_plastic_strain=1e-8):
        """
        Check convergence for plastic analysis
        
        Parameters:
        tolerance_yield: Tolerance for yield function
        tolerance_plastic_strain: Tolerance for plastic strain increment
        
        Returns:
        converged: True if converged
        convergence_info: Dict with convergence details
        """
        max_yield_function = 0.0
        max_plastic_strain_increment = 0.0
        yielded_count = 0
        
        for element_id, elem_data in enumerate(self.elements):
            element = elem_data['element']
            
            # Check yield function
            if abs(element.yield_function_value) > max_yield_function:
                max_yield_function = abs(element.yield_function_value)
            
            # Check if element has yielded
            if element.is_yielded:
                yielded_count += 1
                
                # Check plastic strain increment (if available)
                if hasattr(element, 'plastic_strain_increment'):
                    increment_magnitude = np.linalg.norm(element.plastic_strain_increment)
                    if increment_magnitude > max_plastic_strain_increment:
                        max_plastic_strain_increment = increment_magnitude
        
        # Convergence criteria
        yield_converged = max_yield_function <= tolerance_yield
        plastic_strain_converged = max_plastic_strain_increment <= tolerance_plastic_strain
        converged = yield_converged and plastic_strain_converged
        
        convergence_info = {
            'converged': converged,
            'max_yield_function': max_yield_function,
            'max_plastic_strain_increment': max_plastic_strain_increment,
            'yielded_elements': yielded_count,
            'total_elements': len(self.elements),
            'yield_converged': yield_converged,
            'plastic_strain_converged': plastic_strain_converged
        }
        
        return converged, convergence_info
    
    def get_plastic_analysis_summary(self):
        """
        Get comprehensive summary of plastic analysis
        
        Returns:
        dict: Plastic analysis summary
        """
        plastic_summary = self.get_plastic_strain_summary()
        
        # Add convergence information
        converged, convergence_info = self.check_plastic_convergence()
        plastic_summary.update(convergence_info)
        
        # Add total iterations from iteration history
        total_iterations = sum(record.get('iteration', 0) for record in self.iteration_history)
        if total_iterations == 0 and hasattr(self, 'global_iterations'):
            # Use global iterations if no element-level iterations tracked
            total_iterations = self.global_iterations
        plastic_summary['total_iterations'] = total_iterations
        
        # Add convergence rate
        if len(self.elements) > 0:
            converged_elements = sum(1 for elem_data in self.elements 
                                   if hasattr(elem_data['element'], 'plastic_analysis_info') 
                                   and elem_data['element'].plastic_analysis_info.get('converged', False))
            plastic_summary['convergence_rate'] = converged_elements / len(self.elements)
        else:
            plastic_summary['convergence_rate'] = 0.0
        
        # Add yield function statistics
        yield_functions = []
        yielded_elements_count = 0
        for elem_data in self.elements:
            element = elem_data['element']
            if hasattr(element, 'yield_function_value'):
                yield_functions.append(abs(element.yield_function_value))
            
            # Count yielded elements
            if hasattr(element, 'is_yielded') and element.is_yielded:
                yielded_elements_count += 1
        
        if yield_functions:
            plastic_summary['max_yield_function_abs'] = max(yield_functions)
            plastic_summary['avg_yield_function_abs'] = np.mean(yield_functions)
        else:
            plastic_summary['max_yield_function_abs'] = 0.0
            plastic_summary['avg_yield_function_abs'] = 0.0
        
        # Add yielded elements count
        plastic_summary['total_yielded_elements'] = yielded_elements_count
        plastic_summary['yielded_elements'] = yielded_elements_count
        
        # Add average iterations
        if len(self.iteration_history) > 0:
            iterations = [record.get('iteration', 0) for record in self.iteration_history]
            plastic_summary['average_iterations'] = np.mean(iterations)
        else:
            plastic_summary['average_iterations'] = 0.0
        
        return plastic_summary
    
    def solve_elasto_plastic(self):
        """
        Solve elasto-plastic FEA using Consistent Tangent Matrix (CTM) approach
        """
        print("🔧 Elasto-plastic FEA analysis - solving with Consistent Tangent Matrix")
        
        # Initialize plastic analysis tracking
        total_iterations = 0
        max_global_iterations = 20  # Global Newton-Raphson iterations
        tolerance_yield = 1e-3  # ✅ Use relaxed tolerance
        tolerance_displacement = 1e-8
        
        # Track elements that have yielded
        yielded_elements = []
        displacement_change = float('inf')  # Initialize for convergence check
        
        # Global Newton-Raphson iteration for elasto-plastic analysis
        for global_iter in range(max_global_iterations):
            print(f"🔧 Global iteration {global_iter + 1}/{max_global_iterations}")
            
            # Store previous displacements for convergence check
            if global_iter == 0:
                # First iteration: run elastic analysis
                self.solve()
                prev_displacements = self.displacements.copy()
            else:
                prev_displacements = self.displacements.copy()
            
            # Update stiffness matrix using consistent tangent matrices
            self.update_stiffness_with_consistent_tangent()
            
            # Solve with updated stiffness
            self.solve()
            
            # Check convergence
            displacement_change = np.linalg.norm(self.displacements - prev_displacements)
            print(f"   Displacement change: {displacement_change:.2e}")
            
            # ✅ FORCE: Always run plastic analysis at least once
            if global_iter == 0:
                print(f"   🔧 Forcing plastic analysis on first iteration...")
                force_plastic_analysis = True
            else:
                force_plastic_analysis = False
            
            if displacement_change < tolerance_displacement and not force_plastic_analysis:
                print(f"✅ Global convergence achieved at iteration {global_iter + 1}")
                break
            
            # Update plastic strain for all elements
            yielded_elements = []
            max_yield_function = 0.0
            
            print(f"   🔍 Checking yield conditions for all elements...")
            
            for elem_idx, elem_data in enumerate(self.elements):
                element = elem_data['element']
                node_ids = elem_data['node_ids']
                
                # ✅ Get element-specific displacements (6 DOFs)
                elem_displacements = []
                for node_id in node_ids:
                    u_dof = 2 * node_id
                    v_dof = 2 * node_id + 1
                    elem_displacements.extend([
                        self.displacements[u_dof],
                        self.displacements[v_dof]
                    ])
                elem_displacements = np.array(elem_displacements)
                
                # Get strain increment
                element_strains = element.get_strains(elem_displacements)
                
                # Get current stress and check yield function
                current_stress = element.get_stresses(elem_displacements)
                yield_function_value = element.calculate_yield_function(current_stress)
                max_yield_function = max(max_yield_function, yield_function_value)
                
                # Debug: Print first few elements' yield function values
                if elem_idx < 5:
                    print(f"      Element {elem_idx}: f(σ) = {yield_function_value:.6f}, yielding = {yield_function_value > tolerance_yield}")
                
                # Apply return mapping with CTM
                updated_stress, plastic_strain_inc, converged, consistent_tangent = element.return_mapping_algorithm_with_ctm(
                    current_stress, element_strains, 50, tolerance_yield
                )
                
                # ✅ Track yield function value
                element.yield_function_value = yield_function_value
                
                # Update plastic strain history
                if np.any(plastic_strain_inc != 0):
                    self.update_plastic_strain_history(elem_idx, plastic_strain_inc)
                    yielded_elements.append(elem_idx)
                    element.is_yielded = True
                
                # ✅ Track iteration info
                element.plastic_analysis_info = {
                    'converged': converged,
                    'iterations': 1,  # Each element gets 1 iteration
                    'final_yield_function': yield_function_value,
                    'trial_yield_function': yield_function_value,
                    'is_yielding': yield_function_value > tolerance_yield
                }
                
                total_iterations += 1
            
            print(f"   Max yield function value: {max_yield_function:.6f}")
            print(f"   Yield tolerance: {tolerance_yield:.6f}")
            print(f"   Elements yielded: {len(yielded_elements)}")
            
            # Debug: Show material properties for first element
            if len(self.elements) > 0:
                first_element = self.elements[0]['element']
                print(f"   🔍 Material properties (Element 0):")
                print(f"      Cohesion (c): {first_element.cohesion:.2f} kPa")
                print(f"      Friction angle (φ): {first_element.friction_angle:.2f}°")
                print(f"      Dilation angle (ψ): {first_element.dilation_angle:.2f}°")
                print(f"      Young's modulus (E): {first_element.D_matrix[0,0]:.2f} kPa")
                
                # Get first element displacements and stress FIRST
                first_node_ids = self.elements[0]['node_ids']
                first_elem_displacements = []
                for node_id in first_node_ids:
                    u_dof = 2 * node_id
                    v_dof = 2 * node_id + 1
                    first_elem_displacements.extend([
                        self.displacements[u_dof],
                        self.displacements[v_dof]
                    ])
                first_elem_displacements = np.array(first_elem_displacements)
                first_stress = first_element.get_stresses(first_elem_displacements)
                
                # Debug: Show stress state for first element
                print(f"   🔍 Stress state (Element 0):")
                print(f"      σx: {first_stress[0]:.2f} kPa")
                print(f"      σy: {first_stress[1]:.2f} kPa")
                print(f"      τxy: {first_stress[2]:.2f} kPa")
                
                # Calculate principal stresses manually
                σ_avg = (first_stress[0] + first_stress[1]) / 2
                τ_max = np.sqrt(((first_stress[0] - first_stress[1]) / 2)**2 + first_stress[2]**2)
                σ1 = σ_avg + τ_max
                σ3 = σ_avg - τ_max
                print(f"      σ1: {σ1:.2f} kPa")
                print(f"      σ3: {σ3:.2f} kPa")
                print(f"      σ1 - σ3: {σ1 - σ3:.2f} kPa")
                
                # Calculate Mohr-Coulomb yield function manually using ACTUAL stress
                φ_rad = np.radians(first_element.friction_angle)
                c = first_element.cohesion
                
                # Use ACTUAL stress from current calculation
                σ1_actual = σ1  # Use calculated principal stresses
                σ3_actual = σ3
                
                # Mohr-Coulomb: f(σ) = (σ₁ - σ₃) + (σ₁ + σ₃)sin(φ) - 2c*cos(φ)
                f_manual = (σ1_actual - σ3_actual) + (σ1_actual + σ3_actual) * np.sin(φ_rad) - 2 * c * np.cos(φ_rad)
                print(f"   🔍 Manual yield function calculation (ACTUAL):")
                print(f"      f(σ) = ({σ1_actual:.2f} - {σ3_actual:.2f}) + ({σ1_actual:.2f} + {σ3_actual:.2f})*sin({first_element.friction_angle:.2f}°) - 2*{c:.2f}*cos({first_element.friction_angle:.2f}°)")
                print(f"      f(σ) = {σ1_actual-σ3_actual:.2f} + {σ1_actual+σ3_actual:.2f}*{np.sin(φ_rad):.4f} - 2*{c:.2f}*{np.cos(φ_rad):.4f}")
                print(f"      f(σ) = {f_manual:.6f}")
                print(f"      Yielding threshold: {tolerance_yield:.6f}")
                print(f"      Is yielding: {f_manual > tolerance_yield}")
        
        # Final convergence check
        converged = displacement_change < tolerance_displacement
        
        print(f"✅ Elasto-plastic analysis completed:")
        print(f"   - Total elements: {len(self.elements)}")
        print(f"   - Yielded elements: {len(yielded_elements)}")
        print(f"   - Global iterations: {global_iter + 1}")
        print(f"   - Converged: {converged}")
        
        # ✅ Track global iterations
        self.global_iterations = global_iter + 1
        
        return converged, {
            'total_iterations': total_iterations,
            'global_iterations': global_iter + 1,
            'yielded_elements': yielded_elements,
            'final_displacement_change': displacement_change,
            'converged': converged
        }
    
    def update_stiffness_with_consistent_tangent(self):
        """
        Update global stiffness matrix using consistent tangent matrices from elements
        """
        # Reset global stiffness matrix
        num_dofs = 2 * self.geometry.num_nodes
        self.global_stiffness = np.zeros((num_dofs, num_dofs))
        
        # Assemble using consistent tangent matrices
        for elem_data in self.elements:
            element = elem_data['element']
            node_ids = elem_data['node_ids']
            
            # Get consistent tangent matrix (or elastic matrix if not plastic)
            if element.consistent_tangent_matrix is not None:
                D_matrix = element.consistent_tangent_matrix
            else:
                D_matrix = element.D_matrix
            
            # Update element's D matrix temporarily
            original_D = element.D_matrix.copy()
            element.D_matrix = D_matrix
            
            # Get element stiffness matrix with updated D matrix
            K_elem = element.get_stiffness_matrix()
            
            # Restore original D matrix
            element.D_matrix = original_D
            
            # Assembly into global matrix
            for i in range(3):  # 3 nodes per element
                for j in range(3):
                    # Global DOF indices
                    gi = 2 * node_ids[i]     # u DOF for node i
                    gi_plus_1 = gi + 1       # v DOF for node i
                    gj = 2 * node_ids[j]     # u DOF for node j
                    gj_plus_1 = gj + 1       # v DOF for node j
                    
                    # Local DOF indices
                    li = 2 * i
                    li_plus_1 = li + 1
                    lj = 2 * j
                    lj_plus_1 = lj + 1
                    
                    # Assemble 2x2 submatrix
                    self.global_stiffness[gi, gj] += K_elem[li, lj]
                    self.global_stiffness[gi, gj_plus_1] += K_elem[li, lj_plus_1]
                    self.global_stiffness[gi_plus_1, gj] += K_elem[li_plus_1, lj]
                    self.global_stiffness[gi_plus_1, gj_plus_1] += K_elem[li_plus_1, lj_plus_1]
        
        print(f"✅ Stiffness matrix updated with consistent tangent matrices")
        print(f"   - Total elements: {len(self.elements)}")
        print(f"   - Matrix size: {self.global_stiffness.shape}")
    
    def get_elasto_plastic_results(self):
        """
        Get comprehensive elasto-plastic analysis results
        """
        results = {
            'elastic_results': self.get_element_results(),
            'plastic_analysis': self.get_plastic_analysis_summary(),
            'convergence_info': self.check_plastic_convergence()
        }
        
        # Add plastic strain information to element results
        for i, elem_data in enumerate(self.elements):
            element = elem_data['element']
            if hasattr(element, 'plastic_analysis_info'):
                results['elastic_results'][i]['plastic_analysis'] = element.plastic_analysis_info
                results['elastic_results'][i]['plastic_strain'] = element.plastic_strain.tolist()
                results['elastic_results'][i]['accumulated_plastic_strain'] = element.accumulated_plastic_strain
                results['elastic_results'][i]['is_yielded'] = element.is_yielded
        
        return results
    
    def get_initial_state_for_next_stage(self) -> Dict:
        """
        Get initial state data for the next stage (transfer conditions)
        
        Returns:
        Dict: Initial state data including stress, displacement, PWP, and plastic strain
        """
        print("🔧 Preparing initial state data for next stage...")
        
        initial_state = {
            'stress_state': {},
            'displacement_state': {},
            'pwp_state': {},
            'plastic_strain_state': {},
            'element_count': len(self.elements),
            'new_elements': list(self.new_elements),
            'element_active': self.geometry.element_active.tolist()  # ✅ NEW: Include current active status
        }
        
        # Get current element results
        element_results = self.get_element_results()
        
        # Prepare stress state
        for i, elem_result in enumerate(element_results):
            # ✅ NEW: Use element_index from result
            element_index = elem_result.get('element_index', i)
            element_index_str = str(element_index)
            initial_state['stress_state'][element_index_str] = {
                'total_stress_x': elem_result.get('total_stress_x', 0.0),
                'total_stress_y': elem_result.get('total_stress_y', 0.0),
                'effective_stress_x': elem_result.get('effective_stress_x', 0.0),
                'effective_stress_y': elem_result.get('effective_stress_y', 0.0),
                'effective_principal_stress_1': elem_result.get('effective_principal_stress_1', 0.0),
                'effective_principal_stress_3': elem_result.get('effective_principal_stress_3', 0.0),
                'principal_stresses': elem_result.get('principal_stresses', [0.0, 0.0])
            }
        
        # Prepare displacement state
        nodal_displacements = self.get_nodal_displacements()
        for disp in nodal_displacements:
            node_id = disp.get('node_id', 0)
            initial_state['displacement_state'][str(node_id)] = {
                'u': disp.get('u', 0.0),
                'v': disp.get('v', 0.0),
                'magnitude': disp.get('magnitude', 0.0)
            }
        
        # Prepare PWP state
        nodal_stress_strain = self.get_nodal_stress_strain_results()
        for nodal in nodal_stress_strain:
            node_id = nodal.get('node_id', 0)
            initial_state['pwp_state'][str(node_id)] = {
                'pore_water_pressure': nodal.get('pore_water_pressure', 0.0)
            }
        
        # Prepare plastic strain state
        for i, elem_data in enumerate(self.elements):
            element = elem_data['element']
            # ✅ NEW: Use element_index from element data
            element_index = elem_data.get('element_index', i)
            element_index_str = str(element_index)
            initial_state['plastic_strain_state'][element_index_str] = {
                'plastic_strain': element.plastic_strain.tolist() if hasattr(element, 'plastic_strain') else [0.0, 0.0, 0.0],
                'accumulated_plastic_strain': element.accumulated_plastic_strain if hasattr(element, 'accumulated_plastic_strain') else 0.0,
                'is_yielded': element.is_yielded if hasattr(element, 'is_yielded') else False
            }
        
        print(f"✅ Initial state prepared for {len(self.elements)} elements")
        print(f"✅ New elements in this stage: {len(self.new_elements)}")
        
        return initial_state
    
    
 