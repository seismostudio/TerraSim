"""
CST (Constant Strain Triangle) Element Implementation for Soil Analysis
Implements shape functions, stiffness matrix, and soil-specific calculations
"""

import numpy as np

class CSTElement:
    def __init__(self, nodes):
        """
        Initialize CST element with node coordinates
        
        Parameters:
        nodes: 3x2 array of node coordinates [[x1,y1], [x2,y2], [x3,y3]]
        """
        self.nodes = np.array(nodes)
        self.area = self._calculate_area()
        self.B_matrix = self._calculate_B_matrix()
        self.D_matrix = None  # Will be set when material properties are known
        
        # ✅ NEW: Initial state for transfer conditions
        self.initial_stress = np.zeros(3)  # [σx_initial, σy_initial, τxy_initial]
        self.initial_displacement = np.zeros(6)  # [u1_initial, v1_initial, u2_initial, v2_initial, u3_initial, v3_initial]
        self.initial_pwp = 0.0  # Initial pore water pressure
        self.has_initial_state = False  # Whether element has initial state from previous stage
        
        # ✅ Plastic strain tracking for strain decomposition
        self.plastic_strain = np.zeros(3)  # [εx_plastic, εy_plastic, γxy_plastic]
        self.plastic_strain_history = []  # History of plastic strains for hardening/softening
        self.accumulated_plastic_strain = 0.0  # Scalar measure for hardening laws
        self.yield_function_value = 0.0  # Current yield function value
        self.is_yielded = False  # Whether element has yielded
        
        # ✅ Perfectly plastic Mohr-Coulomb infrastructure
        self.plastic_multiplier = 0.0  # Δλ (plastic multiplier)
        self.yield_function_tolerance = 1e-3  # ✅ More relaxed tolerance for yield function
        self.plastic_strain_tolerance = 1e-8  # Tolerance for plastic strain increment
        
        # ✅ Consistent Tangent Matrix (CTM) infrastructure
        self.consistent_tangent_matrix = None  # Will be computed during plastic correction
        self.is_plastic = False  # Whether element is in plastic state
        self.plastic_deformation_gradient = np.eye(3)  # Plastic deformation gradient
    
    def _calculate_area(self):
        """Calculate element area using cross product"""
        x1, y1 = self.nodes[0]
        x2, y2 = self.nodes[1]
        x3, y3 = self.nodes[2]
        
        area = 0.5 * abs((x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1))
        
        # Check for degenerate elements (zero or very small area)
        if area < 1e-12:
            print(f"WARNING: Degenerate element detected with area {area:.2e}")
            print(f"Node coordinates: ({x1:.6f}, {y1:.6f}), ({x2:.6f}, {y2:.6f}), ({x3:.6f}, {y3:.6f})")
            # Return a small but non-zero area to prevent divide by zero
            area = 1e-12
        
        return area
    
    def _calculate_B_matrix(self):
        """
        Calculate strain-displacement matrix B
        B relates strains to nodal displacements: ε = B * u
        """
        x1, y1 = self.nodes[0]
        x2, y2 = self.nodes[1]
        x3, y3 = self.nodes[2]
        
        # Calculate derivatives of shape functions
        # For CST: dN/dx = (y2-y3)/(2A), dN/dy = (x3-x2)/(2A), etc.
        b1 = y2 - y3
        b2 = y3 - y1
        b3 = y1 - y2
        
        c1 = x3 - x2
        c2 = x1 - x3
        c3 = x2 - x1
        
        # B matrix for plane strain (3x6 matrix)
        # Use a minimum area to prevent divide by zero
        min_area = max(self.area, 1e-12)
        B = np.array([
            [b1, 0, b2, 0, b3, 0],
            [0, c1, 0, c2, 0, c3],
            [c1, b1, c2, b2, c3, b3]
        ]) / (2 * min_area)
        
        return B
    
    def set_material_properties(self, E, nu, t, unit_weight_saturated, unit_weight_unsaturated):
        """
        Set soil material properties and calculate D matrix
        
        Parameters:
        E: Young's modulus (kN/m²)
        nu: Poisson's ratio
        t: thickness (m) - typically 1.0 for plane strain
        unit_weight_saturated: saturated unit weight of soil (kN/m³)
        unit_weight_unsaturated: unsaturated unit weight of soil (kN/m³)
        """
        # D matrix for plane strain (soil analysis)
        factor = E / ((1 + nu) * (1 - 2 * nu))
        self.D_matrix = factor * np.array([
            [1 - nu, nu, 0],
            [nu, 1 - nu, 0],
            [0, 0, (1 - 2 * nu) / 2]
        ])
        self.thickness = t
        self.unit_weight_saturated = unit_weight_saturated  # ✅ Gamma saturated
        self.unit_weight_unsaturated = unit_weight_unsaturated  # ✅ Gamma unsaturated
        
        # Calculate element centroid for gravity loads
        self.centroid = np.mean(self.nodes, axis=0)
    
    def set_initial_state(self, initial_stress=None, initial_displacement=None, initial_pwp=None):
        """
        Set initial state from previous stage for transfer conditions
        
        Parameters:
        initial_stress: Initial stress state [σx, σy, τxy]
        initial_displacement: Initial displacement state [u1, v1, u2, v2, u3, v3]
        initial_pwp: Initial pore water pressure
        """
        if initial_stress is not None:
            self.initial_stress = np.array(initial_stress)
            self.has_initial_state = True
        
        if initial_displacement is not None:
            self.initial_displacement = np.array(initial_displacement)
            self.has_initial_state = True
        
        if initial_pwp is not None:
            self.initial_pwp = float(initial_pwp)
            self.has_initial_state = True
    
    def get_initial_state(self):
        """
        Get initial state for transfer to next stage
        
        Returns:
        dict: Initial state data
        """
        return {
            'initial_stress': self.initial_stress.tolist(),
            'initial_displacement': self.initial_displacement.tolist(),
            'initial_pwp': self.initial_pwp,
            'has_initial_state': self.has_initial_state
        }
    
    def get_stresses_with_initial_state(self, nodal_displacements):
        """
        Calculate stresses including initial state from previous stage
        
        Parameters:
        nodal_displacements: 6x1 array [u1, v1, u2, v2, u3, v3]
        
        Returns:
        stresses: [σx, σy, τxy] in kN/m² including initial state
        """
        # Calculate current stresses
        current_stresses = self.get_stresses(nodal_displacements)
        
        # Add initial stress if available
        if self.has_initial_state:
            total_stresses = current_stresses + self.initial_stress
        else:
            total_stresses = current_stresses
        
        return total_stresses
    
    def get_stiffness_matrix(self):
        """
        Calculate element stiffness matrix
        K = B^T * D * B * A * t
        """
        if self.D_matrix is None:
            raise ValueError("Material properties must be set before calculating stiffness matrix")
        
        # Use minimum area to prevent numerical issues
        min_area = max(self.area, 1e-12)
        K = (self.B_matrix.T @ self.D_matrix @ self.B_matrix * 
             min_area * self.thickness)
        
        # Check for NaN or Inf values in stiffness matrix
        if np.any(np.isnan(K)) or np.any(np.isinf(K)):
            print(f"WARNING: Invalid values in stiffness matrix for element with area {self.area:.2e}")
            # Return zero matrix for degenerate elements
            K = np.zeros((6, 6))
        
        return K
    
    def get_gravity_force(self, water_level_at_element=None):
        """
        Calculate gravity force vector for soil self-weight
        
        Parameters:
        water_level_at_element: Water level elevation at element's x-coordinate (m)
                               If None, uses saturated unit weight
        
        Returns:
        gravity_force: 6x1 array [fx1, fy1, fx2, fy2, fx3, fy3]
        """
        # ✅ Choose unit weight based on water level
        if water_level_at_element is not None:
            # Check if element centroid is below water level
            centroid_y = self.centroid[1]
            if centroid_y < water_level_at_element:
                unit_weight = self.unit_weight_saturated  # Below water level
            else:
                unit_weight = self.unit_weight_unsaturated  # Above water level
        else:
            unit_weight = self.unit_weight_saturated  # Default to saturated
        
        # Gravity acts in negative y-direction
        gravity_force = np.zeros(6)
        
        # Distribute gravity load to nodes based on shape functions
        # For CST, each node gets 1/3 of the total gravity force
        # Use minimum area to prevent numerical issues
        min_area = max(self.area, 1e-12)
        gravity_per_node = unit_weight * min_area * self.thickness / 3.0
        
        # Apply to y-components (fy1, fy2, fy3)
        gravity_force[1] = -gravity_per_node  # fy1
        gravity_force[3] = -gravity_per_node  # fy2
        gravity_force[5] = -gravity_per_node  # fy3
        
        return gravity_force
    
    def get_strains(self, nodal_displacements):
        """
        Calculate strains from nodal displacements
        
        Parameters:
        nodal_displacements: 6x1 array [u1, v1, u2, v2, u3, v3]
        
        Returns:
        strains: [εx, εy, γxy]
        """
        strains = self.B_matrix @ nodal_displacements
        return strains
    
    def get_stresses(self, nodal_displacements):
        """
        Calculate stresses from nodal displacements
        
        Parameters:
        nodal_displacements: 6x1 array [u1, v1, u2, v2, u3, v3]
        
        Returns:
        stresses: [σx, σy, τxy] in kN/m²
        """
        strains = self.get_strains(nodal_displacements)
        stresses = self.D_matrix @ strains
        return stresses
    
    def get_principal_stresses(self, nodal_displacements):
        """
        Calculate principal stresses from nodal displacements
        
        Parameters:
        nodal_displacements: 6x1 array [u1, v1, u2, v2, u3, v3]
        
        Returns:
        principal_stresses: [σ1, σ3] in kN/m²
        """
        # ✅ FIX: Use total stresses (initial + new) for principal stress calculation
        if self.has_initial_state:
            stresses = self.get_stresses_with_initial_state(nodal_displacements)
        else:
            stresses = self.get_stresses(nodal_displacements)
        
        sigma_x, sigma_y, tau_xy = stresses
        
        # Calculate principal stresses
        sigma_avg = (sigma_x + sigma_y) / 2.0
        radius = np.sqrt(((sigma_x - sigma_y) / 2.0)**2 + tau_xy**2)
        
        sigma_1 = sigma_avg + radius  # Major principal stress
        sigma_3 = sigma_avg - radius  # Minor principal stress
        
        return np.array([sigma_1, sigma_3])
    
    def get_shear_strength(self, cohesion, friction_angle):
        """
        Calculate shear strength using Mohr-Coulomb criterion
        
        Parameters:
        cohesion: cohesion in kN/m²
        friction_angle: friction angle in degrees
        
        Returns:
        shear_strength: shear strength in kN/m²
        """
        # Convert friction angle to radians
        phi_rad = np.radians(friction_angle)
        
        # Get principal stresses
        # Note: This requires nodal displacements, so this method should be called
        # after solving the system
        return cohesion + np.tan(phi_rad)  # Simplified for now
    
    def get_safety_factor(self, nodal_displacements, cohesion, friction_angle):
        """
        Calculate safety factor against shear failure
        
        Parameters:
        nodal_displacements: 6x1 array [u1, v1, u2, v2, u3, v3]
        cohesion: cohesion in kN/m²
        friction_angle: friction angle in degrees
        
        Returns:
        safety_factor: factor of safety
        """
        principal_stresses = self.get_principal_stresses(nodal_displacements)
        sigma_1, sigma_3 = principal_stresses
        
        # Convert friction angle to radians
        phi_rad = np.radians(friction_angle)
        
        # Mohr-Coulomb failure criterion
        # σ1 = σ3 * tan²(45° + φ/2) + 2c * tan(45° + φ/2)
        N_phi = np.tan(np.pi/4 + phi_rad/2)**2
        sigma_1_failure = sigma_3 * N_phi + 2 * cohesion * np.sqrt(N_phi)
        
        # Safety factor = σ1_failure / σ1_actual
        # Handle different cases
        if sigma_1 > 0 and sigma_1_failure > 0:
            safety_factor = sigma_1_failure / sigma_1
        elif sigma_1 <= 0 and sigma_1_failure > 0:
            # If actual stress is compressive but failure stress is positive
            safety_factor = 10.0  # Very safe
        elif sigma_1 > 0 and sigma_1_failure <= 0:
            # If actual stress is tensile but failure stress is negative
            safety_factor = 0.1  # Very unsafe
        else:
            # Both are negative (compressive) - check if actual stress is less than failure
            if abs(sigma_1) < abs(sigma_1_failure):
                safety_factor = abs(sigma_1_failure) / abs(sigma_1)
            else:
                safety_factor = 0.1  # Very unsafe
        
        # Ensure safety factor is reasonable
        safety_factor = max(0.1, min(10.0, safety_factor))
        
        return safety_factor 
    
    # ✅ Plastic strain management methods
    
    def update_plastic_strain(self, plastic_strain_increment):
        """
        Update plastic strain with increment from plastic corrector
        
        Parameters:
        plastic_strain_increment: [Δεx_plastic, Δεy_plastic, Δγxy_plastic]
        """
        self.plastic_strain += np.array(plastic_strain_increment)
        
        # Update accumulated plastic strain (scalar measure)
        self.accumulated_plastic_strain += np.sqrt(
            plastic_strain_increment[0]**2 + 
            plastic_strain_increment[1]**2 + 
            0.5 * plastic_strain_increment[2]**2
        )
        
        # Store in history for hardening/softening
        self.plastic_strain_history.append(self.plastic_strain.copy())
        
        # Mark as yielded if plastic strain exists
        if self.accumulated_plastic_strain > 1e-12:
            self.is_yielded = True
    
    def get_total_strain(self, nodal_displacements):
        """
        Get total strain from nodal displacements
        
        Parameters:
        nodal_displacements: 6x1 array [u1, v1, u2, v2, u3, v3]
        
        Returns:
        total_strain: [εx_total, εy_total, γxy_total]
        """
        elastic_strain = self.get_strains(nodal_displacements)
        total_strain = elastic_strain + self.plastic_strain
        return total_strain
    
    def get_elastic_strain(self, nodal_displacements):
        """
        Get elastic strain component (total - plastic)
        
        Parameters:
        nodal_displacements: 6x1 array [u1, v1, u2, v2, u3, v3]
        
        Returns:
        elastic_strain: [εx_elastic, εy_elastic, γxy_elastic]
        """
        total_strain = self.get_total_strain(nodal_displacements)
        elastic_strain = total_strain - self.plastic_strain
        return elastic_strain
    
    def reset_plastic_strain(self):
        """Reset plastic strain to zero (for new analysis)"""
        self.plastic_strain = np.zeros(3)
        self.plastic_strain_history = []
        self.accumulated_plastic_strain = 0.0
        self.yield_function_value = 0.0
        self.is_yielded = False
    
    def get_plastic_strain_magnitude(self):
        """
        Get scalar measure of plastic strain magnitude
        
        Returns:
        plastic_strain_magnitude: scalar value
        """
        return np.sqrt(
            self.plastic_strain[0]**2 + 
            self.plastic_strain[1]**2 + 
            0.5 * self.plastic_strain[2]**2
        )
    
    def get_plastic_strain_info(self):
        """
        Get comprehensive plastic strain information
        
        Returns:
        dict: Plastic strain information
        """
        return {
            'plastic_strain': self.plastic_strain.tolist(),
            'accumulated_plastic_strain': self.accumulated_plastic_strain,
            'plastic_strain_magnitude': self.get_plastic_strain_magnitude(),
            'is_yielded': self.is_yielded,
            'yield_function_value': self.yield_function_value,
            'history_length': len(self.plastic_strain_history)
        }
    
    # ✅ Perfectly plastic Mohr-Coulomb methods
    
    def calculate_yield_function(self, stress_state):
        """
        Calculate Mohr-Coulomb yield function f(σ)
        
        Parameters:
        stress_state: [σx, σy, τxy] in kPa
        
        Returns:
        f_value: Yield function value (f > 0 means yielding)
        """
        σx, σy, τxy = stress_state
        
        # Calculate principal stresses
        σ_avg = (σx + σy) / 2
        τ_max = np.sqrt(((σx - σy) / 2)**2 + τxy**2)
        
        σ1 = σ_avg + τ_max  # Major principal stress
        σ3 = σ_avg - τ_max  # Minor principal stress
        
        # Mohr-Coulomb yield function: f(σ) = (σ₁ - σ₃) + (σ₁ + σ₃)sin(φ) - 2c*cos(φ)
        φ_rad = np.radians(self.friction_angle)
        c = self.cohesion
        
        f_value = (σ1 - σ3) + (σ1 + σ3) * np.sin(φ_rad) - 2 * c * np.cos(φ_rad)
        
        # Store yield function value
        self.yield_function_value = f_value
        
        return f_value
    
    def calculate_plastic_flow_rule(self, stress_state):
        """
        Calculate plastic flow rule ∂f/∂σ for Mohr-Coulomb
        
        Parameters:
        stress_state: [σx, σy, τxy] in kPa
        
        Returns:
        flow_rule: [∂f/∂σx, ∂f/∂σy, ∂f/∂τxy]
        """
        σx, σy, τxy = stress_state
        
        # Calculate principal stresses and directions
        σ_avg = (σx + σy) / 2
        τ_max = np.sqrt(((σx - σy) / 2)**2 + τxy**2)
        
        # Principal stress directions
        if abs(τxy) < 1e-12:
            cos_2θ = 1.0
            sin_2θ = 0.0
        else:
            cos_2θ = (σx - σy) / (2 * τ_max)
            sin_2θ = τxy / τ_max
        
        # ✅ CORRECTED: Mohr-Coulomb flow rule derivatives
        φ_rad = np.radians(self.friction_angle)
        ψ_rad = np.radians(self.dilation_angle)  # Use dilation angle for non-associative flow
        
        # For non-associative flow (ψ ≠ φ), use g(σ) instead of f(σ)
        # ∂g/∂σx = cos_2θ + sin(ψ)
        # ∂g/∂σy = -cos_2θ + sin(ψ)  
        # ∂g/∂τxy = sin_2θ
        
        df_dσx = cos_2θ + np.sin(ψ_rad)
        df_dσy = -cos_2θ + np.sin(ψ_rad)
        df_dτxy = sin_2θ
        
        flow_rule = np.array([df_dσx, df_dσy, df_dτxy])
        
        return flow_rule
    
    def check_yield_condition(self, stress_state):
        """
        Check if stress state exceeds yield surface
        
        Parameters:
        stress_state: [σx, σy, τxy] in kPa
        
        Returns:
        is_yielding: True if f(σ) > tolerance
        f_value: Yield function value
        """
        f_value = self.calculate_yield_function(stress_state)
        is_yielding = f_value > self.yield_function_tolerance
        
        return is_yielding, f_value
    
    def update_plastic_multiplier(self, plastic_multiplier):
        """
        Update plastic multiplier for return mapping
        
        Parameters:
        plastic_multiplier: Δλ (plastic multiplier)
        """
        self.plastic_multiplier = plastic_multiplier
    
    def elastic_predictor(self, current_stress, strain_increment):
        """
        Elastic predictor step: σ_trial = σ_n + D_elastic * Δε_total
        
        Parameters:
        current_stress: Current stress state [σx, σy, τxy] in kPa
        strain_increment: Total strain increment [Δεx, Δεy, Δγxy]
        
        Returns:
        trial_stress: Trial stress state [σx_trial, σy_trial, τxy_trial]
        """
        # Ensure D matrix is available
        if self.D_matrix is None:
            raise ValueError("Material properties must be set before elastic predictor")
        
        # Convert strain increment to vector format
        strain_vector = np.array(strain_increment)
        
        # Elastic predictor: σ_trial = σ_n + D * Δε_total
        stress_increment = self.D_matrix @ strain_vector
        trial_stress = current_stress + stress_increment
        
        return trial_stress
    
    def calculate_trial_stress(self, nodal_displacements_prev, nodal_displacements_current):
        """
        Calculate trial stress from nodal displacement increment
        
        Parameters:
        nodal_displacements_prev: Previous nodal displacements [u1, v1, u2, v2, u3, v3]
        nodal_displacements_current: Current nodal displacements [u1, v1, u2, v2, u3, v3]
        
        Returns:
        trial_stress: Trial stress state
        strain_increment: Total strain increment
        """
        # Calculate strain increment
        strain_prev = self.get_strains(nodal_displacements_prev)
        strain_current = self.get_strains(nodal_displacements_current)
        strain_increment = strain_current - strain_prev
        
        # Get current stress (from previous step or initial)
        if hasattr(self, 'current_stress'):
            current_stress = self.current_stress
        else:
            # Initial stress state (zero or geostatic)
            current_stress = np.zeros(3)
        
        # Elastic predictor
        trial_stress = self.elastic_predictor(current_stress, strain_increment)
        
        return trial_stress, strain_increment
    
    def elastic_predictor_with_yield_check(self, current_stress, strain_increment):
        """
        Elastic predictor with yield check: σ_trial = σ_n + D * Δε_total, then check f(σ_trial)
        
        Parameters:
        current_stress: Current stress state [σx, σy, τxy] in kPa
        strain_increment: Total strain increment [Δεx, Δεy, Δγxy]
        
        Returns:
        trial_stress: Trial stress state
        is_yielding: True if f(σ_trial) > tolerance
        yield_function_value: Value of yield function f(σ_trial)
        """
        # Elastic predictor
        trial_stress = self.elastic_predictor(current_stress, strain_increment)
        
        # Yield check
        is_yielding, yield_function_value = self.check_yield_condition(trial_stress)
        
        return trial_stress, is_yielding, yield_function_value
    
    def get_elastic_plastic_status(self, trial_stress):
        """
        Get comprehensive elastic/plastic status for trial stress
        
        Parameters:
        trial_stress: Trial stress state [σx, σy, τxy]
        
        Returns:
        status: Dict with elastic/plastic status information
        """
        # Calculate yield function
        f_value = self.calculate_yield_function(trial_stress)
        is_yielding = f_value > self.yield_function_tolerance
        
        # Calculate principal stresses for trial stress
        σx, σy, τxy = trial_stress
        σ_avg = (σx + σy) / 2
        τ_max = np.sqrt(((σx - σy) / 2)**2 + τxy**2)
        σ1_trial = σ_avg + τ_max
        σ3_trial = σ_avg - τ_max
        
        # Calculate safety factor (distance from yield surface)
        if is_yielding:
            safety_factor = 0.0  # On or beyond yield surface
        else:
            # Distance from current stress to yield surface
            safety_factor = abs(f_value) / (2 * self.cohesion * np.cos(np.radians(self.friction_angle)))
        
        status = {
            'trial_stress': trial_stress.tolist(),
            'principal_stresses': [σ1_trial, σ3_trial],
            'yield_function_value': f_value,
            'is_yielding': is_yielding,
            'safety_factor': safety_factor,
            'material_properties': {
                'cohesion': self.cohesion,
                'friction_angle': self.friction_angle,
                'dilation_angle': self.dilation_angle
            }
        }
        
        return status
    
    def plastic_corrector(self, trial_stress, strain_increment, max_iterations=100, tolerance=1e-6):
        """
        Plastic corrector (return mapping) for Mohr-Coulomb perfectly plastic model
        
        Parameters:
        trial_stress: Trial stress from elastic predictor [σx, σy, τxy]
        strain_increment: Total strain increment [Δεx, Δεy, Δγxy]
        max_iterations: Maximum iterations for convergence
        tolerance: Convergence tolerance
        
        Returns:
        corrected_stress: Corrected stress state
        plastic_strain_increment: Plastic strain increment
        converged: True if converged
        iterations: Number of iterations used
        """
        # Initialize
        σ_trial = np.array(trial_stress)
        σ_corrected = σ_trial.copy()
        Δε_plastic = np.zeros(3)
        converged = False
        
        # Newton-Raphson iteration for return mapping
        for iteration in range(max_iterations):
            # Calculate yield function for current corrected stress
            f_value = self.calculate_yield_function(σ_corrected)
            
            # Check convergence
            if abs(f_value) <= tolerance:
                converged = True
                break
            
            # Calculate plastic flow rule (∂f/∂σ)
            flow_rule = self.calculate_plastic_flow_rule(σ_corrected)
            
            # Calculate plastic multiplier increment
            # Δλ = f(σ) / (∂f/∂σ : D : ∂f/∂σ)
            D_flow = self.D_matrix @ flow_rule
            denominator = np.dot(flow_rule, D_flow)
            
            if abs(denominator) < 1e-12:
                # Singular case, use small increment
                Δλ = f_value / 1e6
            else:
                Δλ = f_value / denominator
            
            # ✅ IMPROVED: Better plastic multiplier limiting
            # Limit to prevent overshooting and ensure convergence
            max_Δλ = abs(f_value) * 0.1  # More conservative limit
            Δλ = max(-max_Δλ, min(Δλ, max_Δλ))
            
            # Ensure positive plastic multiplier for yielding
            if f_value > 0:
                Δλ = max(0.0, Δλ)
            
            # Update plastic strain increment
            Δε_plastic += Δλ * flow_rule
            
            # Update corrected stress: σ = σ_trial - D * Δε_plastic
            σ_corrected = σ_trial - self.D_matrix @ Δε_plastic
            
            # Store plastic multiplier for this iteration
            self.plastic_multiplier = Δλ
            
            # Check for numerical issues
            if np.any(np.isnan(σ_corrected)) or np.any(np.isinf(σ_corrected)):
                print(f"⚠️ Warning: Numerical issues in plastic corrector at iteration {iteration}")
                break
        
        # Update element's plastic strain
        if converged:
            self.update_plastic_strain(Δε_plastic)
            self.current_stress = σ_corrected.copy()
        else:
            # If not converged, use trial stress as fallback but still update plastic strain
            print(f"⚠️ Warning: Plastic corrector did not converge after {max_iterations} iterations")
            # Still update plastic strain with what we have
            if np.any(Δε_plastic != 0):
                self.update_plastic_strain(Δε_plastic)
            σ_corrected = σ_trial
            Δε_plastic = np.zeros(3)  # Reset for fallback
        
        return σ_corrected, Δε_plastic, converged, iteration + 1
    
    def return_mapping_algorithm(self, current_stress, strain_increment, max_iterations=100, tolerance=1e-6):
        """
        Complete return mapping algorithm: Elastic predictor + Plastic corrector
        
        Parameters:
        current_stress: Current stress state [σx, σy, τxy]
        strain_increment: Total strain increment [Δεx, Δεy, Δγxy]
        max_iterations: Maximum iterations for convergence
        tolerance: Convergence tolerance
        
        Returns:
        final_stress: Final stress state
        plastic_strain_increment: Plastic strain increment
        elastic_strain_increment: Elastic strain increment
        converged: True if converged
        iterations: Number of iterations used
        algorithm_info: Dict with algorithm details
        """
        # Step 1: Elastic predictor
        trial_stress = self.elastic_predictor(current_stress, strain_increment)
        
        # Step 2: Yield check
        is_yielding, f_value = self.check_yield_condition(trial_stress)
        
        if not is_yielding:
            # Elastic response
            final_stress = trial_stress
            plastic_strain_increment = np.zeros(3)
            elastic_strain_increment = strain_increment
            converged = True
            iterations = 0
        else:
            # Plastic response - need return mapping
            final_stress, plastic_strain_increment, converged, iterations = self.plastic_corrector(
                trial_stress, strain_increment, max_iterations, tolerance
            )
            elastic_strain_increment = strain_increment - plastic_strain_increment
        
        # Algorithm information
        algorithm_info = {
            'trial_stress': trial_stress.tolist(),
            'trial_yield_function': f_value,
            'is_yielding': is_yielding,
            'converged': converged,
            'iterations': iterations,
            'final_yield_function': self.calculate_yield_function(final_stress),
            'plastic_multiplier': self.plastic_multiplier
        }
        
        return final_stress, plastic_strain_increment, elastic_strain_increment, converged, iterations, algorithm_info
    
    def return_mapping_algorithm_with_ctm(self, current_stress, strain_increment, max_iterations=100, tolerance=1e-6):
        """
        Return mapping algorithm with Consistent Tangent Matrix for Mohr-Coulomb material
        
        Parameters:
        current_stress: Current stress state [σx, σy, τxy]
        strain_increment: Strain increment [Δεx, Δεy, Δγxy]
        max_iterations: Maximum number of iterations
        tolerance: Convergence tolerance
        
        Returns:
        updated_stress: Updated stress state
        plastic_strain_increment: Plastic strain increment
        converged: Whether algorithm converged
        consistent_tangent: Consistent tangent matrix
        """
        # Elastic predictor
        trial_stress = self.elastic_predictor(current_stress, strain_increment)
        
        # Check yield condition
        f_trial = self.calculate_yield_function(trial_stress)
        
        if f_trial <= tolerance:
            # Elastic response
            self.is_plastic = False
            self.consistent_tangent_matrix = self.D_matrix.copy()
            return trial_stress, np.zeros(3), True, self.D_matrix
        
        # Plastic response - use plastic corrector with CTM
        return self.plastic_corrector_with_ctm(trial_stress, strain_increment, max_iterations, tolerance)
    
    def plastic_corrector_with_ctm(self, trial_stress, strain_increment, max_iterations=100, tolerance=1e-6):
        """
        Plastic corrector with Consistent Tangent Matrix for Mohr-Coulomb material
        
        Parameters:
        trial_stress: Trial stress from elastic predictor
        strain_increment: Strain increment
        max_iterations: Maximum iterations
        tolerance: Convergence tolerance
        
        Returns:
        updated_stress: Updated stress state
        plastic_strain_increment: Plastic strain increment
        converged: Whether converged
        consistent_tangent: Consistent tangent matrix
        """
        self.is_plastic = True
        
        # Initialize
        stress = trial_stress.copy()
        plastic_strain_inc = np.zeros(3)
        
        # Material properties
        c = self.cohesion
        φ = np.radians(self.friction_angle)
        ψ = np.radians(self.dilation_angle)
        
        # Elastic matrix
        D = self.D_matrix
        
        for iteration in range(max_iterations):
            # Calculate yield function and flow rule
            f = self.calculate_yield_function(stress)
            
            if abs(f) <= tolerance:
                # Converged - compute consistent tangent matrix
                consistent_tangent = self.compute_consistent_tangent_matrix(stress, plastic_strain_inc, D)
                self.consistent_tangent_matrix = consistent_tangent
                return stress, plastic_strain_inc, True, consistent_tangent
            
            # Calculate flow rule (∂f/∂σ)
            flow_rule = self.calculate_plastic_flow_rule(stress)
            
            # Calculate hardening modulus (H = 0 for perfectly plastic)
            H = 0.0
            
            # Calculate plastic multiplier increment
            numerator = f
            denominator = np.dot(flow_rule, np.dot(D, flow_rule)) + H
            
            if abs(denominator) < 1e-12:
                print(f"⚠️ Warning: Denominator too small in plastic corrector. Using fallback.")
                break
            
            Δλ = numerator / denominator
            
            # Limit plastic multiplier for stability
            max_Δλ = abs(f) * 0.1  # Conservative limit
            Δλ = max(-max_Δλ, min(Δλ, max_Δλ))
            
            # Update stress and plastic strain
            stress_inc = -Δλ * np.dot(D, flow_rule)
            stress += stress_inc
            
            plastic_strain_inc += Δλ * flow_rule
            
            # Update plastic strain history
            self.plastic_strain += Δλ * flow_rule
            self.accumulated_plastic_strain += abs(Δλ) * np.linalg.norm(flow_rule)
        
        # Not converged - compute approximate consistent tangent
        consistent_tangent = self.compute_consistent_tangent_matrix(stress, plastic_strain_inc, D)
        self.consistent_tangent_matrix = consistent_tangent
        
        return stress, plastic_strain_inc, False, consistent_tangent
    
    def compute_consistent_tangent_matrix(self, stress, plastic_strain_inc, D):
        """
        Compute Consistent Tangent Matrix for Mohr-Coulomb material
        
        Parameters:
        stress: Current stress state
        plastic_strain_inc: Plastic strain increment
        D: Elastic matrix
        
        Returns:
        consistent_tangent: Consistent tangent matrix
        """
        if not self.is_plastic or np.linalg.norm(plastic_strain_inc) < 1e-12:
            # Elastic response
            return D.copy()
        
        # Calculate flow rule at current stress
        flow_rule = self.calculate_plastic_flow_rule(stress)
        
        # Calculate hardening modulus (H = 0 for perfectly plastic)
        H = 0.0
        
        # Compute denominator
        denominator = np.dot(flow_rule, np.dot(D, flow_rule)) + H
        
        if abs(denominator) < 1e-12:
            # Fallback to elastic matrix
            return D.copy()
        
        # Compute consistent tangent matrix
        # D_ct = D - (D * ∂g/∂σ ⊗ ∂f/∂σ * D) / (∂f/∂σ * D * ∂g/∂σ + H)
        
        # For associative flow (∂g/∂σ = ∂f/∂σ)
        flow_outer = np.outer(flow_rule, flow_rule)
        
        # Compute correction term
        correction = np.dot(D, np.dot(flow_outer, D)) / denominator
        
        # Consistent tangent matrix
        consistent_tangent = D - correction
        
        # Ensure symmetry and positive definiteness
        consistent_tangent = 0.5 * (consistent_tangent + consistent_tangent.T)
        
        # Check positive definiteness
        try:
            np.linalg.cholesky(consistent_tangent)
        except np.linalg.LinAlgError:
            # Not positive definite - use elastic matrix
            print(f"⚠️ Warning: Consistent tangent matrix not positive definite. Using elastic matrix.")
            return D.copy()
        
        return consistent_tangent 