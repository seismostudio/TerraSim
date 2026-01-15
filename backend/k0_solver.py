import numpy as np
from typing import List, Dict, Any, Tuple, Optional
from cst_element import CSTElement

class K0Solver:
    """
    K0 Procedure Solver for geotechnical analysis
    
    This solver calculates at-rest earth pressure conditions using K0 procedure,
    which is useful for initial stress state analysis and validation.
    
    K0 = 1 - sin(φ) where φ is the friction angle
    """
    
    def __init__(self, geometry, element_materials, boundary_conditions, water_level=0.0, water_level_points=None, is_initial_stage=True, initial_stress_state=None, initial_displacement_state=None, initial_pwp_state=None, initial_plastic_strain_state=None, previous_stage_active_elements=None):
        """
        Initialize K0 Solver
        
        Parameters:
        geometry: Mesh geometry object containing nodes and elements
        element_materials: List of material properties for each element
        boundary_conditions: Boundary conditions object
        water_level: Default water level elevation
        water_level_points: List of water level points for interpolation
        is_initial_stage: Whether this is the initial stage
        initial_stress_state: Initial stress state from previous stage
        initial_displacement_state: Initial displacement state from previous stage
        initial_pwp_state: Initial PWP state from previous stage
        initial_plastic_strain_state: Initial plastic strain state from previous stage
        previous_stage_active_elements: Boolean array from previous stage for active element detection
        """
        self.geometry = geometry
        self.element_materials = element_materials
        self.boundary_conditions = boundary_conditions
        self.water_level = water_level
        self.water_level_points = water_level_points or []
        self.is_initial_stage = is_initial_stage
        self.initial_stress_state = initial_stress_state or {}
        self.initial_displacement_state = initial_displacement_state or {}
        self.initial_pwp_state = initial_pwp_state or {}
        self.initial_plastic_strain_state = initial_plastic_strain_state or {}
        self.previous_stage_active_elements = previous_stage_active_elements
        
        # ✅ NEW: Initialize active element tracking
        self.new_elements = set()
        self.deactivated_elements = set()
        
        # Create elements with materials
        self.elements = self._create_elements()
        
        # Initialize results storage (similar to FEA solver)
        self.stage_results = {
            'displacements': [0.0] * (2 * self.geometry.num_nodes),  # Zero displacements for K0 as Python list
            'stress_state': None,
            'element_results': [],
            'nodal_results': [],
            'soil_results': {},
            'summary': {}
        }
        
        # Cache for performance optimization
        self._surface_nodes_cache = None
        self._surface_elevation_cache = {}
        self._element_area_cache = {}
        self._element_centroid_cache = {}
        
        print(f"🔧 K0 Solver initialized with {len(self.elements)} elements")
    
    def _create_elements(self):
        """Create elements with material assignments"""
        elements = []
        
        for i, element_nodes in enumerate(self.geometry.elements):
            # ✅ NEW: Check if element is active
            if hasattr(self.geometry, 'element_active') and self.geometry.element_active is not None:
                if not self.geometry.element_active[i]:
                    print(f"🔧 Skipping inactive element {i}")
                    continue
            
            # Get node coordinates for this element
            nodes_coords = self.geometry.nodes[element_nodes]
            
            # Create CST element
            element = CSTElement(nodes_coords)
            
            # Get material for this element
            element_material = None
            for mat_data in self.element_materials:
                if mat_data['element_id'] == i:
                    element_material = mat_data['material']
                    break
            
            # Validate material assignment
            if not element_material:
                raise ValueError(f"Element {i} has no material assigned. Please assign material to all polygons before generating mesh.")
            
            # Validate required material properties
            required_properties = ['youngsModulus', 'poissonsRatio', 'unitWeightSaturated', 'unitWeightUnsaturated', 'cohesion', 'frictionAngle', 'dilationAngle', 'thickness']
            missing_properties = [prop for prop in required_properties if prop not in element_material]
            if missing_properties:
                raise ValueError(f"Material for element {i} missing required properties: {missing_properties}")
            
            # Validate gamma values: unsaturated must be less than saturated
            if element_material['unitWeightUnsaturated'] >= element_material['unitWeightSaturated']:
                raise ValueError(f"Element {i}: unitWeightUnsaturated ({element_material['unitWeightUnsaturated']}) must be less than unitWeightSaturated ({element_material['unitWeightSaturated']})")
            
            element.set_material_properties(
                element_material['youngsModulus'],
                element_material['poissonsRatio'],
                element_material['thickness'],
                element_material['unitWeightSaturated'],
                element_material['unitWeightUnsaturated']
            )
            
            # ✅ Store additional material properties for plastic analysis
            element.dilation_angle = element_material.get('dilationAngle', 0.0)  # Default to 0 if not provided
            element.cohesion = element_material.get('cohesion', 0.0)
            element.friction_angle = element_material.get('frictionAngle', 0.0)
            
            # ✅ NEW: Check if this is a new element
            if self._is_new_element(i):
                self.new_elements.add(i)
                print(f"🔧 Element {i} identified as NEW element (activated in this stage)")
            
            # ✅ NEW: Check if this element was deactivated
            if self._is_deactivated_element(i):
                self.deactivated_elements.add(i)
                print(f"🔧 Element {i} identified as DEACTIVATED element")
            
            # ✅ NEW: Initialize element with initial state from previous stage (if not new and not initial stage)
            if not self.is_initial_stage and not self._is_new_element(i) and not self._is_deactivated_element(i):
                self._initialize_element_with_previous_state(element, i)
            
            elements.append({
                'element': element,
                'node_ids': element_nodes,
                'material': element_material,
                'element_index': i  # ✅ Use element_index consistently
            })
        
        return elements
    
    def _initialize_element_with_previous_state(self, element: CSTElement, element_index: int):
        """
        Initialize element with initial state from previous stage
        
        Parameters:
        element: CST element to initialize
        element_index: Element index (enumerate index)
        """
        # ✅ Use element_index consistently with sequential_history
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
    
    def _is_new_element(self, element_index: int) -> bool:
        """
        Check if element is new (was inactive in previous stage, now active)
        
        Parameters:
        element_index: Index of the element to check
        
        Returns:
        bool: True if element is new, False otherwise
        """
        # If no previous stage data, element is not new
        if self.previous_stage_active_elements is None:
            return False
        
        # If element index is out of bounds, assume it's new
        if element_index >= len(self.previous_stage_active_elements):
            return True
        
        # Element is new if it was inactive in previous stage but active now
        was_inactive = not self.previous_stage_active_elements[element_index]
        is_active_now = self.geometry.element_active[element_index] if hasattr(self.geometry, 'element_active') and self.geometry.element_active is not None else True
        
        return was_inactive and is_active_now
    
    def _is_deactivated_element(self, element_index: int) -> bool:
        """
        Check if element was deactivated (was active in previous stage, now inactive)
        
        Parameters:
        element_index: Index of the element to check
        
        Returns:
        bool: True if element was deactivated, False otherwise
        """
        # If no previous stage data, element was not deactivated
        if self.previous_stage_active_elements is None:
            return False
        
        # If element index is out of bounds, assume it was not deactivated
        if element_index >= len(self.previous_stage_active_elements):
            return False
        
        # Element was deactivated if it was active in previous stage but inactive now
        was_active = self.previous_stage_active_elements[element_index]
        is_inactive_now = not self.geometry.element_active[element_index] if hasattr(self.geometry, 'element_active') and self.geometry.element_active is not None else False
        
        return was_active and is_inactive_now
    
    def solve(self):
        """
        Solve K0 procedure analysis
        
        Returns:
        dict: Complete analysis results in same format as FEA solver
        """
        print("🔧 Starting K0 procedure analysis...")
        
        try:
            # Calculate K0 stress state
            stress_state = self._calculate_k0_stress_state()
            
            # ✅ NEW: Check initial yield condition
            yield_check_results = self.check_initial_yield_condition(stress_state)
            
            # Calculate element results
            element_results = self.get_element_results()
            
            # Calculate nodal results
            nodal_results = self.get_nodal_stress_strain_results()
            
            # Calculate soil-specific results
            soil_results = self.get_soil_specific_results()
            
            # ✅ FIX: Use get_summary method instead of _calculate_summary
            summary = self.get_summary(soil_results)
            
            # ✅ NEW: Add yield check results to summary
            summary.update({
                'yield_check': yield_check_results,
                'yielded_elements_count': yield_check_results['yielded_elements'],  # ✅ Already an integer
                'max_yield_function': yield_check_results['max_yield_function_abs'],  # ✅ Use correct field name
                'has_initial_yielding': yield_check_results['yielded_elements'] > 0  # ✅ Already an integer
            })
            
            # Store results
            self.stage_results.update({
                'stress_state': stress_state,
                'element_results': element_results,
                'nodal_results': nodal_results,
                'soil_results': soil_results,
                'summary': summary,
                'yield_check_results': yield_check_results  # ✅ NEW: Store yield check results
            })
            
            print("✅ K0 procedure analysis completed successfully")
            return self.stage_results
            
        except Exception as e:
            print(f"❌ Error in K0 analysis: {e}")
            raise

    def check_initial_yield_condition(self, stress_state):
        """
        Check if initial K0 stress state causes yielding
        
        Parameters:
        stress_state: K0 stress state results
        
        Returns:
        dict: Yield check results
        """
        print("🔧 Checking initial yield condition for K0 stress state...")
        
        yielded_elements = []
        yield_function_values = []
        max_yield_function = 0.0
        
        for i, elem_data in enumerate(self.elements):
            element = elem_data['element']
            element_stress = stress_state['element_stresses'][i]
            
            # Get K0 stress state (principal stresses)
            sigma_1 = element_stress['sigma_1']  # Vertical stress (major principal)
            sigma_3 = element_stress['sigma_3']  # Horizontal stress (minor principal)
            
            # Create stress state for yield function [σx, σy, τxy]
            # For K0 condition: σx = σ3, σy = σ1, τxy = 0
            stress_state_vector = [sigma_3, sigma_1, 0.0]  # [σx, σy, τxy]
            
            # Check yield function
            f_value = element.calculate_yield_function(stress_state_vector)
            yield_function_values.append(f_value)
            
            if f_value > 0:
                yielded_elements.append(i)
                print(f"⚠️ Warning: Element {i} yields under initial K0 conditions")
                print(f"   σ1 = {sigma_1:.2f} kPa, σ3 = {sigma_3:.2f} kPa")
                print(f"   Yield function value = {f_value:.6f}")
            
            max_yield_function = max(max_yield_function, abs(f_value))
        
        # ✅ FIX: Convert 0-based indices to 1-based element IDs for frontend
        yielded_elements_1based = [elem_id + 1 for elem_id in yielded_elements]
        
        # ✅ FIX: Use same format as FEA plastic analysis
        yield_check_results = {
            'total_elements': len(self.elements),
            'yielded_elements': len(yielded_elements),
            'yielded_elements_list': yielded_elements_1based,  # ✅ 1-based IDs for frontend
            'total_iterations': 0,  # K0 doesn't have iterations
            'convergence_rate': 1.0,  # K0 always converges
            'converged': True,  # K0 always converges
            'max_yield_function_abs': max_yield_function,
            'avg_yield_function_abs': np.mean(yield_function_values) if yield_function_values else 0.0,
            'plastic_strain_history': {},  # K0 doesn't have plastic strain
            'accumulated_plastic_strain_history': {},  # K0 doesn't have plastic strain
            'iteration_history': []  # K0 doesn't have iterations
        }
        
        if yielded_elements:
            print(f"⚠️ Warning: {len(yielded_elements)} elements yield under initial K0 conditions")
            print(f"   Yielded elements: {yielded_elements}")
        else:
            print("✅ All elements remain elastic under initial K0 conditions")
        
        return yield_check_results
    
    def _calculate_k0_stress_state(self):
        """Calculate K0 stress state for all elements"""
        print("🔧 Calculating K0 stress state")
        
        stress_state = {
            'element_stresses': [],
            'nodal_stresses': [],
            'k0_values': []
        }
        
        for i, elem_data in enumerate(self.elements):
            element = elem_data['element']
            element_material = elem_data['material']
            
            # Calculate K0 for this element's material
            phi_rad = np.radians(element_material['frictionAngle'])
            k0 = 1 - np.sin(phi_rad)
            
            # Get element centroid
            centroid_x, centroid_y = float(element.centroid[0]), float(element.centroid[1])
            
            # Find surface elevation above centroid
            surface_y = self._find_surface_elevation_above_node(centroid_x, centroid_y)
            depth = max(0, surface_y - centroid_y)
            
            # Calculate layered soil stress
            sigma_1 = self._calculate_layered_soil_stress(centroid_y, surface_y)
            sigma_3 = sigma_1 * k0  # Horizontal stress
            
            # Calculate pore water pressure
            water_level_at_element = self.interpolate_water_level_at_x(centroid_x)
            pore_water_pressure = -9.81 * max(0, water_level_at_element - centroid_y) if centroid_y < water_level_at_element else 0.0
            
            # Store element stress state
            element_stress = {
                'element_id': i,
                'sigma_1': sigma_1,  # Vertical stress
                'sigma_3': sigma_3,  # Horizontal stress
                'k0': k0,
                'pore_water_pressure': pore_water_pressure,
                'depth': depth,
                'centroid': (centroid_x, centroid_y)
            }
            
            stress_state['element_stresses'].append(element_stress)
            stress_state['k0_values'].append(k0)
        
        print(f"✅ K0 stress state calculated for {len(stress_state['element_stresses'])} elements")
        return stress_state
    
    def get_element_results(self):
        """Get element results in same format as FEA solver"""
        print("🔧 Calculating element results for K0 procedure")
        
        results = []
        
        for elem_data in self.elements:
            element = elem_data['element']
            node_ids = elem_data['node_ids']
            element_material = elem_data['material']
            
            # Calculate K0 for this element's material
            phi_rad = np.radians(element_material['frictionAngle'])
            k0 = 1 - np.sin(phi_rad)
            
            # Get element centroid
            centroid_x, centroid_y = float(element.centroid[0]), float(element.centroid[1])
            
            # Find surface elevation above centroid
            surface_y = self._find_surface_elevation_above_node(centroid_x, centroid_y)
            depth = max(0, surface_y - centroid_y)
            
            # ✅ FIX: Use initial state if available (for transfer stages)
            element_index = elem_data['element_index']
            if not self.is_initial_stage and element.has_initial_state and element.initial_stress is not None:
                # Use initial stress from previous stage
                initial_stress = element.initial_stress
                total_stress_x = initial_stress[0]  # σx from initial state
                total_stress_y = initial_stress[1]  # σy from initial state
                total_stress_xy = initial_stress[2]  # τxy from initial state
                
                # Use initial PWP if available
                if element.initial_pwp is not None:
                    pore_water_pressure = element.initial_pwp
                else:
                    # Calculate pore water pressure
                    water_level_at_element = self.interpolate_water_level_at_x(centroid_x)
                    pore_water_pressure = -9.81 * max(0, water_level_at_element - centroid_y) if centroid_y < water_level_at_element else 0.0
                
                # Only print for first few elements to avoid spam
                if element_index < 5:
                    print(f"🔧 Element {element_index} using initial stress: [{total_stress_x:.2f}, {total_stress_y:.2f}, {total_stress_xy:.2f}] kPa")
            else:
                # Calculate layered soil stress (for initial stage or new elements)
                sigma_1 = self._calculate_layered_soil_stress(centroid_y, surface_y)
                sigma_3 = sigma_1 * k0  # Horizontal stress
                
                # Calculate pore water pressure
                water_level_at_element = self.interpolate_water_level_at_x(centroid_x)
                pore_water_pressure = -9.81 * max(0, water_level_at_element - centroid_y) if centroid_y < water_level_at_element else 0.0
                
                # For K0 procedure, stresses are constant within element
                total_stress_x = sigma_3  # σx = σ₃ (horizontal)
                total_stress_y = sigma_1  # σy = σ₁ (vertical)
                total_stress_xy = 0.0     # τxy = 0 (no shear in K0)
            
            # Calculate effective stresses
            effective_stress_x = total_stress_x - pore_water_pressure  # σ'x = σ₃ - u
            effective_stress_y = total_stress_y - pore_water_pressure  # σ'y = σ₁ - u
            effective_stress_xy = total_stress_xy  # τ'xy = τxy = 0
            
            # Calculate effective principal stresses
            effective_principal_stress_1 = sigma_1 - pore_water_pressure  # σ'₁ = σ₁ - u
            effective_principal_stress_3 = effective_principal_stress_1 * k0  # σ'₃ = σ'₁ × K₀
            
            # For K0 procedure, strains are zero (no deformation)
            strains = np.array([0.0, 0.0, 0.0])  # [εx, εy, γxy]
            stresses = np.array([total_stress_x, total_stress_y, total_stress_xy])  # [σx, σy, τxy]
            principal_stresses = np.array([sigma_1, sigma_3])  # [σ₁, σ₃]
            
            # Zero displacements for K0 procedure
            elem_displacements = np.array([0.0] * 6)  # 3 nodes × 2 DOF each
            
            results.append({
                'element_index': elem_data.get('element_index', len(results)),  # ✅ Use element_index consistently
                'node_ids': node_ids,
                'strains': strains.tolist(),
                'stresses': stresses.tolist(),
                'principal_stresses': principal_stresses.tolist(),
                'total_stress_x': float(total_stress_x),
                'total_stress_y': float(total_stress_y),
                'effective_stress_x': float(effective_stress_x),
                'effective_stress_y': float(effective_stress_y),
                'effective_principal_stress_1': float(effective_principal_stress_1),
                'effective_principal_stress_3': float(effective_principal_stress_3),
                'pore_water_pressure': float(pore_water_pressure),
                'displacements': elem_displacements.tolist(),
                'k0': float(k0),
                'depth': float(depth)
            })
        
        print(f"✅ Element results calculated for {len(results)} elements")
        return results
    
    def get_nodal_stress_strain_results(self, interpolation_method='area_weighted'):
        """Get nodal results in same format as FEA solver"""
        print(f"🔧 Calculating nodal results with interpolation method: {interpolation_method}")
        
        element_results = self.get_element_results()
        
        # Initialize nodal values arrays
        num_nodes = self.geometry.num_nodes
        nodal_effective_stress_x = np.zeros(num_nodes)
        nodal_effective_stress_y = np.zeros(num_nodes)
        nodal_total_stress_x = np.zeros(num_nodes)
        nodal_total_stress_y = np.zeros(num_nodes)
        nodal_effective_principal_stress_1 = np.zeros(num_nodes)
        nodal_effective_principal_stress_3 = np.zeros(num_nodes)
        nodal_pore_water_pressure = np.zeros(num_nodes)
        
        # Weighted sums for interpolation
        nodal_weighted_effective_stress_x = np.zeros(num_nodes)
        nodal_weighted_effective_stress_y = np.zeros(num_nodes)
        nodal_weighted_total_stress_x = np.zeros(num_nodes)
        nodal_weighted_total_stress_y = np.zeros(num_nodes)
        nodal_weighted_effective_principal_stress_1 = np.zeros(num_nodes)
        nodal_weighted_effective_stress_3 = np.zeros(num_nodes)
        nodal_weight_sums = np.zeros(num_nodes)
        
        # Interpolate element results to nodes
        for elem_result in element_results:
            node_ids = elem_result['node_ids']
            
            # Calculate weights based on interpolation method
            if interpolation_method == 'area_weighted':
                element_area = self._calculate_element_area(node_ids)
                weights = [element_area / 3.0] * 3
            else:  # simple_average
                weights = [1.0/3.0] * 3
            
            # Apply weights
            for i, node_id in enumerate(node_ids):
                weight = weights[i]
                nodal_weighted_effective_stress_x[node_id] += elem_result['effective_stress_x'] * weight
                nodal_weighted_effective_stress_y[node_id] += elem_result['effective_stress_y'] * weight
                nodal_weighted_total_stress_x[node_id] += elem_result['total_stress_x'] * weight
                nodal_weighted_total_stress_y[node_id] += elem_result['total_stress_y'] * weight
                nodal_weighted_effective_principal_stress_1[node_id] += elem_result['effective_principal_stress_1'] * weight
                nodal_weighted_effective_stress_3[node_id] += elem_result['effective_principal_stress_3'] * weight
                nodal_weight_sums[node_id] += weight
                
                # Pore water pressure (same for all nodes in element)
                nodal_pore_water_pressure[node_id] = elem_result['pore_water_pressure']
        
        # Normalize by weight sums
        valid_nodes = nodal_weight_sums > 0
        nodal_effective_stress_x[valid_nodes] = nodal_weighted_effective_stress_x[valid_nodes] / nodal_weight_sums[valid_nodes]
        nodal_effective_stress_y[valid_nodes] = nodal_weighted_effective_stress_y[valid_nodes] / nodal_weight_sums[valid_nodes]
        nodal_total_stress_x[valid_nodes] = nodal_weighted_total_stress_x[valid_nodes] / nodal_weight_sums[valid_nodes]
        nodal_total_stress_y[valid_nodes] = nodal_weighted_total_stress_y[valid_nodes] / nodal_weight_sums[valid_nodes]
        nodal_effective_principal_stress_1[valid_nodes] = nodal_weighted_effective_principal_stress_1[valid_nodes] / nodal_weight_sums[valid_nodes]
        nodal_effective_principal_stress_3[valid_nodes] = nodal_weighted_effective_stress_3[valid_nodes] / nodal_weight_sums[valid_nodes]
        
        # Create nodal results
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
        
        print(f"✅ Nodal results calculated for {num_nodes} nodes")
        return nodal_results
    
    def get_nodal_displacements(self):
        """Get nodal displacements (zero for K0 procedure)"""
        nodal_displacements = [
            {
                'node_id': i,
                'u': 0.0,  # Zero horizontal displacement
                'v': 0.0,  # Zero vertical displacement
                'magnitude': 0.0  # Zero total displacement
            }
            for i in range(self.geometry.num_nodes)
        ]
        
        return nodal_displacements
    
    def get_soil_specific_results(self):
        """Get soil-specific analysis results"""
        element_results = self.get_element_results()
        
        # Calculate overall soil stability
        max_effective_principal_stress_1 = max([elem['effective_principal_stress_1'] for elem in element_results])
        max_principal_stress = max([elem['principal_stresses'][0] for elem in element_results]) if element_results else 0.0
        
        # ✅ FIX: Calculate total stress statistics
        max_total_stress_x = max([elem['total_stress_x'] for elem in element_results]) if element_results else 0.0
        min_total_stress_x = min([elem['total_stress_x'] for elem in element_results]) if element_results else 0.0
        max_total_stress_y = max([elem['total_stress_y'] for elem in element_results]) if element_results else 0.0
        min_total_stress_y = min([elem['total_stress_y'] for elem in element_results]) if element_results else 0.0
        
        # Calculate pore water pressure statistics
        nodal_stress_strain = self.get_nodal_stress_strain_results()
        if nodal_stress_strain:
            max_pore_water_pressure = max([node['pore_water_pressure'] for node in nodal_stress_strain])
            min_pore_water_pressure = min([node['pore_water_pressure'] for node in nodal_stress_strain])
        else:
            max_pore_water_pressure = 0.0
            min_pore_water_pressure = 0.0
        
        # For K0 procedure, settlements are zero
        max_settlement = 0.0
        surface_settlements = [0.0] * len(self._find_surface_nodes())
        
        return {
            'max_effective_principal_stress_1': float(max_effective_principal_stress_1),
            'max_principal_stress': float(max_principal_stress),
            # ✅ FIX: Add total stress to soil results
            'max_total_stress_x': float(max_total_stress_x),
            'min_total_stress_x': float(min_total_stress_x),
            'max_total_stress_y': float(max_total_stress_y),
            'min_total_stress_y': float(min_total_stress_y),
            'max_settlement': float(max_settlement),
            'surface_settlements': [float(s) for s in surface_settlements],
            'max_pore_water_pressure': float(max_pore_water_pressure),
            'min_pore_water_pressure': float(min_pore_water_pressure)
        }
    

    
    def get_stage_results(self):
        """Get complete stage results in same format as FEA solver"""
        return self.stage_results
    
    def get_summary(self, soil_results):
        """Calculate analysis summary"""
        # Calculate summary statistics
        max_displacement = 0.0  # Zero for K0
        max_settlement = soil_results.get('max_settlement', 0.0)
        min_safety_factor = 0  # Not calculated in K0
        
        max_effective_principal_stress_1 = soil_results.get('max_effective_principal_stress_1', 0.0)
        max_pore_water_pressure = soil_results.get('max_pore_water_pressure', 0.0)
        min_pore_water_pressure = soil_results.get('min_pore_water_pressure', 0.0)
        
        # ✅ FIX: Add total stress to summary
        max_total_stress_x = soil_results.get('max_total_stress_x', 0.0)
        min_total_stress_x = soil_results.get('min_total_stress_x', 0.0)
        max_total_stress_y = soil_results.get('max_total_stress_y', 0.0)
        min_total_stress_y = soil_results.get('min_total_stress_y', 0.0)
        
        # For K0 procedure, stability assessment is based on stress state
        if max_effective_principal_stress_1 > 0:
            stability_assessment = "STABLE"
        else:
            stability_assessment = "UNSTABLE"
        
        return {
            'max_displacement': float(max_displacement),
            'min_displacement': 0.0,  # K0 has zero displacements
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
            'analysis_type': 'K0_Procedure'
        }
    
    def get_active_nodes(self):
        """Get list of active node IDs for current stage"""
        active_nodes = set()
        for elem_data in self.elements:
            # Convert numpy.int64 to Python int
            node_ids = [int(node_id) for node_id in elem_data['node_ids']]
            active_nodes.update(node_ids)
        return list(active_nodes)
    

    
    # Helper methods (same as FEA solver)
    def _calculate_layered_soil_stress(self, element_y, surface_y):
        """Calculate vertical stress considering layered soil materials"""
        if element_y >= surface_y:
            return 0.0
        
        total_stress = 0.0
        
        # Sort elements by Y coordinate (top to bottom)
        sorted_elements = sorted(self.elements, key=lambda x: float(x['element'].centroid[1]), reverse=True)
        
        # Calculate stress contribution from each layer
        for i, elem_data in enumerate(sorted_elements):
            elem_centroid_y = float(elem_data['element'].centroid[1])
            
            # Skip elements below our target element
            if elem_centroid_y <= element_y:
                continue
                
            # Skip elements above surface
            if elem_centroid_y > surface_y:
                continue
            
            # Skip if this is the same element
            if abs(elem_centroid_y - element_y) < 0.01:
                continue
            
            # Get material properties
            element_material = elem_data['material']
            
            # Calculate layer thickness
            if i == 0 or float(sorted_elements[i-1]['element'].centroid[1]) > surface_y:
                layer_thickness = surface_y - elem_centroid_y
            else:
                prev_centroid_y = float(sorted_elements[i-1]['element'].centroid[1])
                layer_thickness = prev_centroid_y - elem_centroid_y
            
            layer_thickness = max(0.0, layer_thickness)
            
            if layer_thickness > 0:
                # Choose unit weight based on water level
                elem_centroid_x = float(elem_data['element'].centroid[0])
                water_level_at_layer = self.interpolate_water_level_at_x(elem_centroid_x)
                
                if elem_centroid_y < water_level_at_layer:
                    unit_weight = element_material['unitWeightSaturated']
                else:
                    unit_weight = element_material['unitWeightUnsaturated']
                
                stress_contribution = -unit_weight * layer_thickness
                total_stress += stress_contribution
        
        return total_stress
    
    def _find_surface_elevation_above_node(self, node_x, node_y):
        """Find surface elevation above a given node"""
        cache_key = (round(node_x, 3), round(node_y, 3))
        
        if cache_key in self._surface_elevation_cache:
            return self._surface_elevation_cache[cache_key]
        
        surface_nodes = self._find_surface_nodes()
        
        # Find closest surface node
        closest_surface_node = None
        min_x_distance = float('inf')
        
        for node_id in surface_nodes:
            surface_x, surface_y = float(self.geometry.nodes[node_id][0]), float(self.geometry.nodes[node_id][1])
            x_distance = abs(surface_x - node_x)
            
            if x_distance < min_x_distance:
                min_x_distance = x_distance
                closest_surface_node = node_id
        
        if closest_surface_node is not None:
            _, surface_y = float(self.geometry.nodes[closest_surface_node][0]), float(self.geometry.nodes[closest_surface_node][1])
            self._surface_elevation_cache[cache_key] = surface_y
            return surface_y
        else:
            # Fallback
            surface_y = self._interpolate_surface_elevation_from_active_nodes(node_x, node_y)
            self._surface_elevation_cache[cache_key] = surface_y
            return surface_y
    
    def _find_surface_nodes(self):
        """Find surface nodes"""
        if self._surface_nodes_cache is not None:
            return self._surface_nodes_cache
        
        # Get all nodes from elements
        active_nodes = set()
        for elem_data in self.elements:
            active_nodes.update(elem_data['node_ids'])
        
        # Get coordinates for active nodes
        active_nodes_with_coords = [
            (i, float(x), float(y)) for i, (x, y) in enumerate(self.geometry.nodes)
            if i in active_nodes
        ]
        
        # Sort by X coordinate
        nodes_sorted_by_x = sorted(active_nodes_with_coords, key=lambda node: node[1])
        
        # Find surface nodes
        surface_node_ids = []
        x_tolerance = 0.1
        
        current_x_group = []
        current_x = None
        
        for node_id, x, y in nodes_sorted_by_x:
            if current_x is None or abs(x - current_x) <= x_tolerance:
                current_x_group.append((node_id, x, y))
                current_x = x
            else:
                if current_x_group:
                    surface_node = self._find_surface_node_in_group(current_x_group)
                    if surface_node is not None:
                        surface_node_ids.append(surface_node)
                
                current_x_group = [(node_id, x, y)]
                current_x = x
        
        # Process last group
        if current_x_group:
            surface_node = self._find_surface_node_in_group(current_x_group)
            if surface_node is not None:
                surface_node_ids.append(surface_node)
        
        self._surface_nodes_cache = surface_node_ids
        return surface_node_ids
    
    def _find_surface_node_in_group(self, node_group):
        """Find surface node in a group"""
        if not node_group:
            return None
        
        if len(node_group) == 1:
            return node_group[0][0]
        
        # Return highest Y coordinate
        return max(node_group, key=lambda node: node[2])[0]
    
    def _interpolate_surface_elevation_from_active_nodes(self, node_x, node_y):
        """Interpolate surface elevation from active nodes"""
        active_nodes = set()
        for elem_data in self.elements:
            active_nodes.update(elem_data['node_ids'])
        
        nodes_with_distances = []
        for i, node_coords in enumerate(self.geometry.nodes):
            if i in active_nodes:
                x, y = float(node_coords[0]), float(node_coords[1])
                distance = np.sqrt((x - node_x)**2 + (y - node_y)**2)
                nodes_with_distances.append((i, x, y, distance))
        
        nodes_with_distances.sort(key=lambda node: node[3])
        
        if not nodes_with_distances:
            return node_y
        
        closest_node_id, closest_x, closest_y, _ = nodes_with_distances[0]
        return closest_y
    
    def _calculate_element_area(self, node_ids):
        """Calculate element area"""
        cache_key = tuple(sorted(node_ids))
        
        if cache_key in self._element_area_cache:
            return self._element_area_cache[cache_key]
        
        x1, y1 = float(self.geometry.nodes[node_ids[0]][0]), float(self.geometry.nodes[node_ids[0]][1])
        x2, y2 = float(self.geometry.nodes[node_ids[1]][0]), float(self.geometry.nodes[node_ids[1]][1])
        x3, y3 = float(self.geometry.nodes[node_ids[2]][0]), float(self.geometry.nodes[node_ids[2]][1])
        
        area = 0.5 * abs(x1*(y2 - y3) + x2*(y3 - y1) + x3*(y1 - y2))
        
        self._element_area_cache[cache_key] = area
        return area
    
    def interpolate_water_level_at_x(self, x_coord):
        """Interpolate water level at x-coordinate"""
        if not self.water_level_points:
            return self.water_level
        
        points = [(point['x'], point['y']) for point in self.water_level_points]
        sorted_points = sorted(points, key=lambda p: p[0])
        
        if len(sorted_points) == 1:
            return sorted_points[0][1]
        
        for i in range(len(sorted_points) - 1):
            x1, y1 = sorted_points[i]
            x2, y2 = sorted_points[i + 1]
            
            if x1 <= x_coord <= x2:
                if x2 - x1 > 0:
                    t = (x_coord - x1) / (x2 - x1)
                    water_level = y1 + t * (y2 - y1)
                    return water_level
        
        if x_coord <= sorted_points[0][0]:
            return sorted_points[0][1]
        else:
            return sorted_points[-1][1]
    
    def clear_cache(self):
        """Clear all cached results"""
        self._surface_nodes_cache = None
        self._surface_elevation_cache.clear()
        self._element_area_cache.clear()
        self._element_centroid_cache.clear()
        print("✅ K0 Solver cache cleared")
    
    def get_cache_stats(self):
        """Get cache statistics"""
        return {
            'surface_nodes_cached': self._surface_nodes_cache is not None,
            'surface_elevation_cache_size': len(self._surface_elevation_cache),
            'element_area_cache_size': len(self._element_area_cache),
            'element_centroid_cache_size': len(self._element_centroid_cache)
        }
    
    def get_initial_state_for_next_stage(self) -> Dict:
        """
        Get initial state data for the next stage (transfer conditions)
        
        Returns:
        Dict: Initial state data including stress, displacement, PWP, and plastic strain
        """
        print("🔧 Preparing initial state data for next stage from K0 solver...")
        
        initial_state = {
            'stress_state': {},
            'displacement_state': {},
            'pwp_state': {},
            'plastic_strain_state': {},
            'element_count': len(self.elements),
            'new_elements': list(self.new_elements),
            'element_active': self.geometry.element_active.tolist() if hasattr(self.geometry, 'element_active') and self.geometry.element_active is not None else []
        }
        
        # Get current element results
        element_results = self.get_element_results()
        
        # Prepare stress state
        for i, elem_result in enumerate(element_results):
            # ✅ Use element_index consistently
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
        
        # Prepare displacement state (zero for K0)
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
        
        # Prepare plastic strain state (zero for K0)
        for i, elem_data in enumerate(self.elements):
            element_index = elem_data.get('element_id', i)
            element_index_str = str(element_index)
            initial_state['plastic_strain_state'][element_index_str] = {
                'plastic_strain': [0.0, 0.0, 0.0],  # Zero for K0
                'accumulated_plastic_strain': 0.0,  # Zero for K0
                'is_yielded': False  # No yielding in K0
            }
        
        print(f"✅ Initial state prepared for {len(self.elements)} elements from K0 solver")
        print(f"✅ New elements in this stage: {len(self.new_elements)}")
        
        return initial_state 