import numpy as np
import time
from typing import List, Dict, Optional
from backend.models import (
    SolverRequest, SolverResponse, NodeResult, StressResult, MaterialModel, DrainageType, Point,
    MeshResponse, Material, PhaseType, SolverSettings, PhaseResult
)
try:
    from backend.error import ErrorCode, get_error_info
except ImportError:
    # Fallback if not yet fully integrated
    ErrorCode = None
    get_error_info = lambda x: str(x)
from backend.plasticity import mohr_coulomb_yield, return_mapping_mohr_coulomb

# --- CST Element Helper ---

# --- PWP and Drainage Helpers ---

def get_water_level_at(x: float, water_level_polyline: Optional[List[Dict]] = None) -> Optional[float]:
    """Interpolate water level Y at given X from a polyline (ordered by X)."""
    if not water_level_polyline or len(water_level_polyline) < 1:
        return None
    
    # Sort by X just in case
    pts = sorted(water_level_polyline, key=lambda p: p['x'])
    
    if x <= pts[0]['x']:
        return pts[0]['y']
    if x >= pts[-1]['x']:
        return pts[-1]['y']
    
    # Linear interpolation
    for i in range(len(pts) - 1):
        p1 = pts[i]
        p2 = pts[i+1]
        if p1['x'] <= x <= p2['x']:
            # y = y1 + (x - x1) * (y2 - y1) / (x2 - x1)
            t = (x - p1['x']) / (p2['x'] - p1['x'])
            return p1['y'] + t * (p2['y'] - p1['y'])
    return None

def compute_element_matrices(nodes_coords, material: Material, water_level: Optional[List[Dict]] = None, thickness: float = 1.0):
    """
    Compute Stiffness (K) and Gravity Load (F_grav) for a single CST element.
    Includes logic for Sat/Unsat weight and PWP.
    """
    x = [nodes_coords[0][0], nodes_coords[1][0], nodes_coords[2][0]]
    y = [nodes_coords[0][1], nodes_coords[1][1], nodes_coords[2][1]]
    
    # Centroid
    cx = sum(x) / 3.0
    cy = sum(y) / 3.0
    
    # Area = 0.5 * det(J)
    b = [y[1]-y[2], y[2]-y[0], y[0]-y[1]]
    c = [x[2]-x[1], x[0]-x[2], x[1]-x[0]]
    
    area2 = x[0]*(y[1]-y[2]) + x[1]*(y[2]-y[0]) + x[2]*(y[0]-y[1])
    area = 0.5 * area2
    
    if area <= 0:
        return None, None, None, None, 0.0
        
    B = np.zeros((3, 6))
    for i in range(3):
        B[0, 2*i] = b[i]
        B[1, 2*i+1] = c[i]
        B[2, 2*i] = c[i]
        B[2, 2*i+1] = b[i]
    B /= area2
    
    if material.drainage_type == DrainageType.UNDRAINED_C or material.drainage_type == DrainageType.NON_POROUS:
        E = material.youngsModulus
        
    else:
        E = material.effyoungsModulus

    nu = material.poissonsRatio
    
    factor = E / ((1 + nu) * (1 - 2*nu))
    D = np.array([
        [1-nu, nu, 0],
        [nu, 1-nu, 0],
        [0, 0, (1-2*nu)/2]
    ]) * factor
    
    K = (B.T @ D @ B) * (area * thickness)
    
    # --- PWP Calculation ---
    water_y = get_water_level_at(cx, water_level)
    gamma_w = 9.81  # kN/m3
    pwp = 0.0
    if material.drainage_type not in [DrainageType.NON_POROUS, DrainageType.UNDRAINED_C, DrainageType.UNDRAINED_B]:
        if water_y is not None and cy < water_y:
            # Pressure is negative (compression convention)
            pwp = -gamma_w * (water_y - cy)
    
    # --- Unit Weight Selection ---
    # Total unit weight used for vertical stress calculation
    if material.drainage_type == DrainageType.NON_POROUS:
        # Non-porous materials only have one unit weight
        rho_tot = material.unitWeightUnsaturated
    elif water_y is not None and cy < water_y:
        # Use saturated weight if below water level, fallback to unsaturated if not provided
        rho_tot = material.unitWeightSaturated if material.unitWeightSaturated is not None else material.unitWeightUnsaturated
    else:
        rho_tot = material.unitWeightUnsaturated
        
    force_per_node = (area * thickness * rho_tot) / 3.0
    
    # Gravity acts in -Y direction
    F_grav = np.zeros(6)
    F_grav[1] = -force_per_node
    F_grav[3] = -force_per_node
    F_grav[5] = -force_per_node
    
    return K, F_grav, B, D, pwp

def compute_vertical_stress_k0(elem_props: List[Dict], nodes: List[List[float]], water_level_data: Optional[List[Dict]]):
    """
    Compute initial stresses using K0 procedure.
    """
    # 1. Calculate Centroids
    for ep in elem_props:
        ns = [nodes[n] for n in ep['nodes']]
        ep['cx'] = sum(n[0] for n in ns) / 3.0
        ep['cy'] = sum(n[1] for n in ns) / 3.0
        ep['ymax'] = max(n[1] for n in ns)
        ep['ymin'] = min(n[1] for n in ns)
    
    # 2. Find Surface for each element (Ray casting up)
    # Simple brute force: Find max Y of any element covering this x
    initial_stresses = {}
    
    # Pre-calculate surface Y profile for optimization could be done, but O(N^2) is acceptable for typical 2D geotech meshes (<5000 elements)
    
    gamma_w = 9.81
    
    for ep in elem_props:
        cx_target = ep['cx']
        cy_target = ep['cy']
        eid = ep['id']
        mat = ep['material']
        
        # Calculate PWP first
        water_y = get_water_level_at(cx_target, water_level_data)
        pwp = 0.0
        if mat.drainage_type not in [DrainageType.NON_POROUS, DrainageType.UNDRAINED_C, DrainageType.UNDRAINED_B] \
           and water_y is not None and cy_target < water_y:
            pwp = -gamma_w * (water_y - cy_target) # Tension positive? No, pressure is usually positive in soil mech but solver uses Tension Positive.
            # Wait, solver convention:
            # PWP is pressure.
            # Effective Stress = Total Stress - PWP * m (compression positive for PWP usually)
            # In Models.py: pwp = -gamma_w * ... was used. 
            # Let's check `compute_element_matrices`: 
            # pwp = -gamma_w * (water_y - cy)
            # This implies PWP is NEGATIVE for compression? 
            # Standard FEM: Tension Positive. Compression Negative.
            # Water Pressure is Compressive -> Negative.
            pass
        
        ep['pwp'] = pwp

        # Calculate Vertical Total Stress (Sigma_v)
        # Find all elements physically above this point
        # A simpler robust approximation for general meshes:
        # Sum (gamma * thickness) of all elements intersecting the vertical ray above cy_target
        
        # We need to find segments of the vertical ray passing through elements.
        # This is complex geometry. 
        
        # Simplified "Geostatic" Assumption for standard stratigraphy:
        # Sigma_v = Sum(Gamma_layer * Thickness_layer)
        # We find the columns above.
        
        sigma_v_total = 0.0
        
        # Identify elements intersecting line x=cx_target, y > cy_target
        # And sort them by Y
        # For CST triangles, intersection length is needed.
        
        # Alternative: Just use integration from surface Y
        # Find Y_surface at cx_target
        y_surface = -1e9
        # Check all elements
        for other in elem_props:
            # Check if x_target is within x-range of other element
            xs = [nodes[n][0] for n in other['nodes']]
            if min(xs) <= cx_target <= max(xs):
                y_surface = max(y_surface, max([nodes[n][1] for n in other['nodes']]))
        
        if y_surface < -1e8: y_surface = cy_target # Should not happen
        
        # Use local material weight? No, need simpler logic for MVP fix.
        # Use average gamma? Or simplified:
        # Assume homogeneous column for now or simple layering.
        # Ideally, we should trace the layers.
        # Let's attempt the trace:
        
        # Filter elements above
        candidates = []
        for other in elem_props:
             xs = [nodes[n][0] for n in other['nodes']]
             ys = [nodes[n][1] for n in other['nodes']]
             if min(xs) <= cx_target <= max(xs) and min(ys) > cy_target:
                 candidates.append(other)
        
        # This is still hard to integrate exactly without polygon clipping.
        # FALLBACK: Use simple Gamma * Depth using current element's gamma.
        # This is "good enough" for single layer or simple cases, but wrong for complex ones.
        # Improved Fallback: Use logic from PLAXIS "Gamma * h" if materials are not overlapping.
        
        # Let's implement the Integration:
        # Sigma_v = (Y_surf - Y_curr) * Gamma_eff ??
        # No, Integral(Gamma * dy).
        
        # Very simple integration: Step upwards.
        current_y = cy_target
        current_sigma = 0.0
        
        # We can't step easily. 
        # Let's use the simple Depth * Gamma for this implementation phase 
        # but warn that it respects local gamma.
        # Actually, for "K0 Procedure", PLAXIS usually integrates.
        
        # Let's use: Sigma_v = (Y_surface - cy_target) * mat.unitWeight
        # This assumes single material. If multi-material, this is wrong.
        # FIX: We MUST handle multi-material.
        
        # Let's try sampling:
        # Sample points every 0.1m from cy_target to y_surface.
        # At each point, find which element it is in, get gamma.
        # Sum up.
        steps = 20
        dy = (y_surface - cy_target) / steps
        sigma_accum = 0.0
        if dy > 0:
            for i in range(steps):
                y_sample = cy_target + (i + 0.5) * dy
                # Find element at (cx_target, y_sample)
                # Optimization: check 'candidates' first
                gamma_sample = mat.unitWeightUnsaturated 
                # ^ Default to self if not found (e.g. gaps/air? no stress)
                
                found = False
                for cand in candidates:
                    # Point in triangle test?
                    if is_point_in_triangle([nodes[n] for n in cand['nodes']], [cx_target, y_sample]):
                        # Check water
                        wy = get_water_level_at(cx_target, water_level_data)
                        if wy is not None and y_sample < wy:
                             gamma_sample = cand['material'].unitWeightSaturated or cand['material'].unitWeightUnsaturated
                        else:
                             gamma_sample = cand['material'].unitWeightUnsaturated
                        found = True
                        break
                
                if not found:
                    # Maybe it is self?
                    if is_point_in_triangle([nodes[n] for n in ep['nodes']], [cx_target, y_sample]):
                         # Check water
                        wy = get_water_level_at(cx_target, water_level_data)
                        if wy is not None and y_sample < wy:
                             gamma_sample = mat.unitWeightSaturated or mat.unitWeightUnsaturated
                        else:
                             gamma_sample = mat.unitWeightUnsaturated
                
                sigma_accum += gamma_sample * dy
        
        sigma_v_total = -sigma_accum # Compression is negative
        
        # Calculate Horizontal Effective Stress
        # Sigma_v_eff = Sigma_v_total - PWP
        # Check signs: PWP is negative (compressive). Sigma_v_total is negative (compressive).
        # Sigma' = (-100) - (-10) = -90. Correct.
        
        sigma_v_eff = sigma_v_total - pwp
        
        # K0
        # K0 = 1 - sin(phi) usually
        phi = mat.frictionAngle or 0.0
        k0 = mat.k0_x
        if k0 is None:
            # Automatic K0 Calculation
            if mat.frictionAngle is not None and mat.frictionAngle > 0:
                # Jaky's Formula (Best for NC soils)
                k0 = 1.0 - np.sin(np.deg2rad(mat.frictionAngle))
            elif mat.poissonsRatio is not None and mat.poissonsRatio > 0:
                # Elastic Formula (Fallback if no Phi, e.g. Undrained B/C)
                # K0 = nu / (1 - nu)
                nu = mat.poissonsRatio
                # Cap nu to avoid division by zero or negative K0
                if nu > 0.499: nu = 0.499 
                k0 = nu / (1.0 - nu)
            else:
                k0 = 0.5 # Default fallback
            
        sigma_h_eff = k0 * sigma_v_eff
        
        # Total Horizontal
        sigma_h_total = sigma_h_eff + pwp
        
        # Stress Vector [sig_xx, sig_yy, sig_xy]
        # Assuming principal axes align with global axes for K0
        initial_stresses[eid] = np.array([sigma_h_total, sigma_v_total, 0.0])
        
    return initial_stresses

def is_point_in_triangle(triangle_coords, point):
    p0, p1, p2 = triangle_coords
    x, y = point
    x0, y0 = p0
    x1, y1 = p1
    x2, y2 = p2
    
    denom = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2)
    if denom == 0: return False
    a = ((y1 - y2) * (x - x2) + (x2 - x1) * (y - y2)) / denom
    b = ((y2 - y0) * (x - x2) + (x0 - x2) * (y - y2)) / denom
    c = 1 - a - b
    return 0 <= a <= 1 and 0 <= b <= 1 and 0 <= c <= 1



def solve_phases(request: SolverRequest, should_stop=None):
    mesh = request.mesh
    settings = request.settings
    
    log = []
    
    # === 0. Settings Validation (Safety Guard) ===
    validation_errors = []
    if settings.tolerance < 0.001 or settings.tolerance > 0.1:
        validation_errors.append(get_error_info(ErrorCode.VAL_TOLERANCE_OOB))
    if settings.max_iterations < 1 or settings.max_iterations > 100:
        validation_errors.append(get_error_info(ErrorCode.VAL_ITERATIONS_OOB))
    if settings.initial_step_size < 0.001 or settings.initial_step_size > 1.0:
        validation_errors.append(get_error_info(ErrorCode.VAL_STEP_SIZE_OOB))
    if settings.max_load_fraction < 0.01 or settings.max_load_fraction > 1.0:
        validation_errors.append(get_error_info(ErrorCode.VAL_LOAD_FRAC_OOB))
    if settings.max_steps < 1 or settings.max_steps > 1000:
        validation_errors.append(get_error_info(ErrorCode.VAL_MAX_STEPS_OOB))
    if (settings.min_desired_iterations or 0) > (settings.max_desired_iterations or 100):
         validation_errors.append(get_error_info(ErrorCode.VAL_ITER_MISMATCH))
    if len(mesh.elements) > 2000:
        validation_errors.append(get_error_info(ErrorCode.VAL_OVER_ELEMENT_LIMIT))

    if validation_errors:
        for err in validation_errors:
            msg = f"{err}"
            log.append(msg)
            yield {"type": "log", "content": msg}
            print(msg)
        
        # Stop and yield error status
        yield {"type": "phase_result", "content": {
            "phase_id": request.phases[0].id if request.phases else "error",
            "success": False,
            "error": "Calculation blocked due to invalid solver settings. Please check the logs.",
            "displacements": [],
            "stresses": []
        }}
        return

    num_nodes = len(mesh.nodes)
    num_dof = num_nodes * 2
    nodes = mesh.nodes
    elements = mesh.elements
    
    # Material and Polygon Map
    elem_props_all = [] # List of all possible elements
    
    # Process water level polyline: convert Points to Dicts if necessary
    water_level_data = None
    if request.water_level:
        water_level_data = [{"x": p.x, "y": p.y} for p in request.water_level]

    # Pre-calculate all element matrices (Initial state)
    for i, elem_nodes in enumerate(elements):
        elem_id = i + 1
        # Find element metadata
        elem_meta = next((em for em in mesh.element_materials if em.element_id == elem_id), None)
        if not elem_meta: continue
        
        mat = elem_meta.material
        poly_id = elem_meta.polygon_id
        
        coords = [nodes[n] for n in elem_nodes]
        K_el, F_grav, B, D, pwp = compute_element_matrices(coords, mat, water_level=water_level_data)
        
        if K_el is None: continue
            
        elem_props_all.append({
            'id': elem_id,
            'nodes': elem_nodes,
            'B': B,
            'D': D,
            'K': K_el,
            'F_grav': F_grav,
            'material': mat,
            'polygon_id': poly_id,
            'pwp': pwp,
            'area': 0.5 * abs(coords[0][0]*(coords[1][1]-coords[2][1]) + coords[1][0]*(coords[2][1]-coords[0][1]) + coords[2][0]*(coords[0][1]-coords[1][1]))
        })

    # Global State Tracking
    total_displacement = np.zeros(num_dof)
    element_stress_state = {ep['id']: np.zeros(3) for ep in elem_props_all} # Storing TOTAL Stress for consistency with F_int logic, but we must be careful.
    element_strain_state = {ep['id']: np.zeros(3) for ep in elem_props_all}
    element_yield_state = {ep['id']: False for ep in elem_props_all}
    element_pwp_excess_state = {ep['id']: 0.0 for ep in elem_props_all} # Excess PWP accumulator
    
    phase_results = []
    
    # Point Load Tracking (to calculate incremental Delta F)
    # Map node -> [fx, fy]
    # Point Load Tracking (to calculate incremental Delta F)
    # Map node -> [fx, fy]
    active_point_loads = {} 

    for phase_idx, phase in enumerate(request.phases):
        if should_stop and should_stop():
            log.append("Analysis cancelled by user.")
            yield {"type": "log", "content": "Analysis cancelled by user."}
            break

        msg_start = f"--- Starting Phase: {phase.name} ({phase.id}) [Type: {phase.phase_type or 'plastic'}] ---"
        log.append(msg_start)
        yield {"type": "log", "content": msg_start}
        print(msg_start)
        
        # 1. Identify Active/Inactive Elements
        active_elem_props = [ep for ep in elem_props_all if ep['polygon_id'] in phase.active_polygon_indices]
        active_ids = {ep['id'] for ep in active_elem_props}
        
        # 2. Identify Active Nodes
        active_node_indices = set()
        for ep in active_elem_props:
            for n_idx in ep['nodes']:
                active_node_indices.add(n_idx)

        # Handle K0 Procedure
        if phase.phase_type == PhaseType.K0_PROCEDURE:
            msg_k0 = "Running K0 Procedure for stress initialization..."
            log.append(msg_k0)
            yield {"type": "log", "content": msg_k0}
            print(msg_k0)
            k0_stresses = compute_vertical_stress_k0(active_elem_props, nodes, water_level_data)
            
            # Update global state
            for eid, stress in k0_stresses.items():
                element_stress_state[eid] = stress
                # Strain remains zero (conceptually)
                element_strain_state[eid] = np.zeros(3)
                element_yield_state[eid] = False
            
            # Reset Displacements (K0 procedure generates stress without deformation)
            total_displacement = np.zeros(num_dof)
            
            # Create Result Object
            p_displacements = [NodeResult(id=i+1, ux=0.0, uy=0.0) for i in range(num_nodes)]
            p_stresses = []
            for ep in active_elem_props:
                eid = ep['id']
                sig = element_stress_state[eid]
                pwp_val = ep['pwp']
                
                # Calculate likely Sig ZZ (K0 condition: sig_zz = sig_xx usually in 2D plane strain symmetric)
                # But let's use the constitutive law if poss, or just use sig_h
                # In basic K0, sig_h = K0 * sig_v. sig_zz is typically also K0 * sig_v for isotropic.
                sig_zz = sig[0] 
                
                p_stresses.append(StressResult(
                    element_id=eid, sig_xx=sig[0], sig_yy=sig[1], sig_xy=sig[2],
                    sig_zz=sig_zz, pwp=pwp_val, is_yielded=False, m_stage=1.0
                ))
            
            phase_results.append({
                'phase_id': phase.id,
                'success': True,
                'displacements': p_displacements,
                'stresses': p_stresses,
                'pwp': [ep['pwp'] for ep in active_elem_props],
                'reached_m_stage': 1.0,
                'step_failed_at': None,
                'error': None
            })
            msg_k0_done = "K0 Procedure completed."
            log.append(msg_k0_done)
            yield {"type": "log", "content": msg_k0_done}
            print(msg_k0_done)
            
            # Yield Phase Result immediately
            latest_phase_res = phase_results[-1]
            yield {"type": "phase_result", "content": latest_phase_res}
            continue # Skip to next phase
            
        # Standard FEA Steps (Plastic, Gravity Loading, Consolidation, etc.)
        # 3. Assemble Stiffness Matrix (K) for Active Elements
        K_global = np.zeros((num_dof, num_dof))
        for ep in active_elem_props:
            nodes_e = ep['nodes']
            K_el = ep['K']
            for li in range(3):
                gi = nodes_e[li]
                for lj in range(3):
                    gj = nodes_e[lj]
                    K_global[gi*2:gi*2+2, gj*2:gj*2+2] += K_el[li*2:li*2+2, lj*2:lj*2+2]
        
        # 4. Apply Boundary Conditions
        # (Assuming BCs are global for now, but could be specific to phase if needed)
        fixed_dofs = set()
        for bc in mesh.boundary_conditions.full_fixed:
            fixed_dofs.add(bc.node * 2)
            fixed_dofs.add(bc.node * 2 + 1)
        
        xs = [p[0] for p in nodes]; min_x, max_x = min(xs), max(xs)
        for bc in mesh.boundary_conditions.normal_fixed:
            nx = nodes[bc.node][0]
            if abs(nx - min_x) < 1e-3 or abs(nx - max_x) < 1e-3:
                fixed_dofs.add(bc.node * 2)
        
        # Only nodes that are active AND not fixed are in free_dofs
        free_dofs = []
        for i in range(num_nodes):
            if i in active_node_indices:
                if (i * 2) not in fixed_dofs:
                    free_dofs.append(i * 2)
                if (i * 2 + 1) not in fixed_dofs:
                    free_dofs.append(i * 2 + 1)
        
        K_free = K_global[np.ix_(free_dofs, free_dofs)]
        
        # 4. Calculate Incremental Forces (Delta F)
        delta_F_external = np.zeros(num_dof)
        
        # A. Gravity Changes (New activation minus Deactivation)
        parent_phase = next((p for p in request.phases if p.id == phase.parent_id), None) if phase.parent_id else None
        parent_active_indices = set(parent_phase.active_polygon_indices) if parent_phase else set()
        current_active_indices = set(phase.active_polygon_indices)

        for ep in elem_props_all:
            poly_id = ep['polygon_id']
            is_active_now = poly_id in current_active_indices
            was_active_before = poly_id in parent_active_indices
            
            if is_active_now and not was_active_before:
                # Newly activated -> Add full gravity
                for li in range(3):
                    gi = ep['nodes'][li]
                    delta_F_external[gi*2:gi*2+2] += ep['F_grav'][li*2:li*2+2]
            elif was_active_before and not is_active_now:
                # Deactivated -> Subtract its gravity (it's gone)
                for li in range(3):
                    gi = ep['nodes'][li]
                    delta_F_external[gi*2:gi*2+2] -= ep['F_grav'][li*2:li*2+2]
                    
        # B. Stress Release from Deactivated Elements (Excavation)
        for ep in elem_props_all:
            poly_id = ep['polygon_id']
            if poly_id in parent_active_indices and poly_id not in current_active_indices:
                eid = ep['id']
                sigma_prev = element_stress_state[eid]
                area = ep['area']
                # F_int = Integral(B^T * sigma) * area
                f_int_el = ep['B'].T @ sigma_prev * area * 1.0 # thickness=1
                for li in range(3):
                    gi = ep['nodes'][li]
                    # We ADD the release force because the boundary is now MISSING 
                    # the support from this element.
                    delta_F_external[gi*2:gi*2+2] += f_int_el[li*2:li*2+2]
        
        # B. Point Load Changes
        current_load_vectors = np.zeros(num_dof)
        parent_load_vectors = np.zeros(num_dof)
        
        # Map point_load_id to its assignment node and vector
        load_map = {pl.id: pl for pl in (request.point_loads or [])}
        assignment_map = {a.point_load_id: a.assigned_node_id - 1 for a in mesh.point_load_assignments}
        
        for lid in phase.active_load_ids:
            if lid in load_map and lid in assignment_map:
                pl = load_map[lid]
                n_idx = assignment_map[lid]
                current_load_vectors[n_idx*2] += pl.fx
                current_load_vectors[n_idx*2+1] += pl.fy
        
        if parent_phase:
            for lid in parent_phase.active_load_ids:
                if lid in load_map and lid in assignment_map:
                    pl = load_map[lid]
                    n_idx = assignment_map[lid]
                    parent_load_vectors[n_idx*2] += pl.fx
                    parent_load_vectors[n_idx*2+1] += pl.fy
        
        delta_F_external += (current_load_vectors - parent_load_vectors)
        
        # 5. Out-of-Balance Forces (Internal Stress vs External Load)
        # IMPORTANT: Always compute F_int from existing element stresses
        # This maintains force equilibrium regardless of displacement reset
        # reset_displacements only affects displacement TRACKING, not force balance
        
        F_int_initial = np.zeros(num_dof)
        for ep in active_elem_props:
            eid = ep['id']
            sigma_prev = element_stress_state[eid]
            area = ep['area']
            f_int_el = ep['B'].T @ sigma_prev * area * 1.0
            for li in range(3):
                gi = ep['nodes'][li]
                F_int_initial[gi*2:gi*2+2] += f_int_el[li*2:li*2+2]
        
        # Debug logging
        F_int_norm = np.linalg.norm(F_int_initial)
        delta_F_norm = np.linalg.norm(delta_F_external)
        msg_forces = f"Phase {phase.name} | F_int_initial norm: {F_int_norm:.2f} kN | delta_F_external norm: {delta_F_norm:.2f} kN | reset_disp: {phase.reset_displacements}"
        log.append(msg_forces)
        yield {"type": "log", "content": msg_forces}
        print(msg_forces)
        
        # Starting Residual (Out-of-balance)
        # R = F_ext_accumulated - F_int_initial
        # But we only APPLY delta_F_external in the MStage loop. 
        # So we start with current stress state, and add delta_F.
        
        # 6. MStage/SRM Loop for the Phase
        current_u_incremental = np.zeros(num_dof)
        
        is_srm = phase.phase_type == PhaseType.SAFETY_ANALYSIS
        if is_srm:
            current_m_stage = 1.0 # SigmaMSF starts at 1.0
            msg_srm = f"--- Phase {phase.name}: Starting Safety Analysis (SRM) ---"
            log.append(msg_srm)
            yield {"type": "log", "content": msg_srm}
        else:
            current_m_stage = 0.0
            
        step_size = settings.initial_step_size
        step_count = 0
        phase_step_points = [{"m_stage": float(current_m_stage), "max_disp": 0.0}]
        yield {"type": "step_point", "content": {"m_stage": float(current_m_stage), "max_disp": 0.0}}
        
        # Temporary history within phase (Step Start State)
        # Initialize at phase start with current global state
        phase_stress_history = {eid: s.copy() for eid, s in element_stress_state.items()}
        phase_strain_history = {eid: s.copy() for eid, s in element_strain_state.items()}
        phase_yield_history = {eid: y for eid, y in element_yield_state.items()}
        phase_pwp_excess_history = {eid: p for eid, p in element_pwp_excess_state.items()}
        
        # Tangent Stiffness Matrix cache
        element_tangent_matrices = {}
        for ep in active_elem_props:
            D_init = ep['D'].copy()
            mat = ep['material']
            if mat.drainage_type == DrainageType.UNDRAINED_A:
                # Add volumetric stiffening of water to the assembly matrix
                # This is CRITICAL for convergence in Newton-Raphson (Undrained A)
                Kw = 2.2e6 # kPa
                porosity = 0.3
                penalty = Kw / porosity
                
                # CRITICAL: Cap penalty to prevent numerical explosion
                # Testing shows penalty > 10x causes exponential overflow
                # K_soil = E / (3(1-2v))
                E_skel = mat.effyoungsModulus or 10000.0
                nu_skel = mat.poissonsRatio or 0.3
                K_skel = E_skel / (3.0 * (1.0 - 2.0 * nu_skel))
                
                # Reduce cap from 100x to 5x for better stability
                if penalty > 5.0 * K_skel:
                    penalty = 5.0 * K_skel
                
                # D_undrained = D_eff + D_water
                # D_water only affects volumetric terms: sig_xx, sig_yy (and sig_zz)
                # For Plane Strain:
                # [ penalty penalty 0 ]
                # [ penalty penalty 0 ]
                # [ 0       0       0 ]
                D_init[0,0] += penalty
                D_init[0,1] += penalty
                D_init[1,0] += penalty
                D_init[1,1] += penalty
                
            element_tangent_matrices[ep['id']] = D_init
        
        log.append(f"Solving equilibrium for phase {phase.name}...")

        while (not is_srm and current_m_stage < 1.0) or (is_srm and current_m_stage < 100.0): # Cap MSF at 100 for safety
            if should_stop and should_stop():
                log.append("Analysis cancelled by user during MStage loop.")
                yield {"type": "log", "content": "Analysis cancelled by user."}
                break
            
            # Step count check is handled inside if converged/else
            if step_count > settings.max_steps: 
                log.append(f"Max steps ({settings.max_steps}) reached. Terminating phase.")
                break
            
            if is_srm and step_size < 0.0001:
                log.append(f"SRM: Step size too small ({step_size:.5f}). Limit state reached.")
                break

            # Step Size Adaptation
            if not is_srm:
                if current_m_stage + step_size > 1.0: step_size = 1.0 - current_m_stage
                target_m_stage = current_m_stage + step_size
            else:
                # In SRM, m_stage represents SigmaMSF
                target_m_stage = current_m_stage + step_size
            
            # Snapshot state at START of this step
            step_start_stress = {k: v.copy() for k,v in phase_stress_history.items()}
            step_start_strain = {k: v.copy() for k,v in phase_strain_history.items()}
            step_start_pwp = {k: v for k,v in phase_pwp_excess_history.items()}
            
            # Newton-Raphson
            iteration = 0
            converged = False
            step_du = np.zeros(num_dof) # Accumulated displacement increment within this step
            
            # Reset Stiffness to Tangent at start of step (or keep updating?)
            # For Modified NR, we might update K only at start of step.
            # Let's rebuild K_free based on element_tangent_matrices
            # (Optimization: Only rebuild if plasticity occurred recently)
            
            while iteration < settings.max_iterations:
                iteration += 1
                
                # F_int = Integral(B^T * sigma_total_new)
                F_int = np.zeros(num_dof)
                temp_phase_stress = {} # Stores Total Stress
                temp_phase_yield = {}
                temp_phase_strain = {}
                temp_phase_pwp_excess = {}
                temp_tangent_matrices = {}
                
                total_u_candidate = total_displacement + current_u_incremental + step_du
                
                for ep in active_elem_props:
                    eid = ep['id']
                    nodes_e = ep['nodes']
                    mat = ep['material']
                    # Static/Steady PWP (from water level)
                    pwp_static = ep['pwp'] or 0.0
                    
                    # Local displacement
                    u_el = np.zeros(6)
                    for li, n in enumerate(nodes_e):
                        u_el[li*2:li*2+2] = total_u_candidate[n*2:n*2+2]
                    
                    # Total Strain at current iteration candidate
                    epsilon_total_cand = ep['B'] @ u_el
                    
                    # IMPORTANT: Incremental strain from START OF STEP
                    # This ensures path independence within the step
                    start_strain = step_start_strain.get(eid, np.zeros(3))
                    d_epsilon_step = epsilon_total_cand - start_strain
                    
                    # Stress Integration
                    sigma_total_start = step_start_stress.get(eid, np.zeros(3))
                    pwp_excess_start = step_start_pwp.get(eid, 0.0)
                    pwp_vec_start = np.array([pwp_static + pwp_excess_start, pwp_static + pwp_excess_start, 0.0])
                    
                    # === DRAINAGE TYPE SEPARATION (Per Doc Section 8) ===
                    # Three distinct analysis types:
                    # 1. Drained: Effective stress with c', φ' (PWP known/zero)
                    # 2. Undrained A: Effective stress with c', φ' + volumetric constraint (PWP computed)
                    # 3. Undrained B/C: Total stress with Su, φ=0 (PWP not tracked)
                    
                    dtype = mat.drainage_type or DrainageType.DRAINED
                    
                    if dtype in [DrainageType.UNDRAINED_B, DrainageType.UNDRAINED_C]:
                        # === UNDRAINED B/C: TOTAL STRESS ANALYSIS ===
                        # Per Doc Section 8.3: Use Su, φ=0, no PWP tracking
                        sigma_total_trial = sigma_total_start + ep['D'] @ d_epsilon_step
                        su = mat.undrainedShearStrength or 0.0
                        
                        # Apply Strength Reduction for SRM
                        if is_srm:
                            su = su / target_m_stage

                        if mat.material_model != MaterialModel.LINEAR_ELASTIC:
                            sigma_total_new, D_alg, yld_new = return_mapping_mohr_coulomb(
                                sigma_total_trial[0], sigma_total_trial[1], sigma_total_trial[2],
                                c=su, phi=0.0, D_elastic=ep['D']
                            )
                        else:
                            sigma_total_new = sigma_total_trial
                            D_alg = ep['D']
                            yld_new = False
                        
                        # PWP not tracked for total stress analysis
                        pwp_excess_new = 0.0
                        temp_tangent_matrices[eid] = D_alg
                        
                    else:
                        # === DRAINED / UNDRAINED A: EFFECTIVE STRESS ANALYSIS ===
                        # Per Doc Section 8.1 & 8.2: Use c', φ' on effective stress
                        # Effective Stress at Step Start
                        sigma_eff_start = sigma_total_start - pwp_vec_start
                        
                        # Elastic Trial Prediction (on effective stress)
                        sigma_eff_trial = sigma_eff_start + ep['D'] @ d_epsilon_step
                        
                        # Plasticity Return Mapping (on effective stress)
                        if mat.material_model != MaterialModel.LINEAR_ELASTIC:
                            c_val = mat.cohesion or 0.0
                            phi_val = mat.frictionAngle or 0.0
                            
                            # Apply Strength Reduction for SRM (c' and phi' reduction)
                            if is_srm:
                                c_val = c_val / target_m_stage
                                phi_rad = np.deg2rad(phi_val)
                                phi_val = np.rad2deg(np.arctan(np.tan(phi_rad) / target_m_stage))

                            sigma_eff_new, D_alg, yld_new = return_mapping_mohr_coulomb(
                                sigma_eff_trial[0], sigma_eff_trial[1], sigma_eff_trial[2],
                                c=c_val, phi=phi_val, D_elastic=ep['D']
                            )
                        else:
                            sigma_eff_new = sigma_eff_trial
                            D_alg = ep['D']
                            yld_new = False
                        
                        # Undrained A: Add volumetric stiffening + compute PWP
                        if dtype == DrainageType.UNDRAINED_A:
                            # Per Doc Section 8.2: du = −(K_w / n) · dε_v
                            # Add water stiffness to tangent matrix
                            D_tan = D_alg.copy()
                            Kw = 2.2e6  # kPa
                            porosity = 0.3
                            penalty = Kw / porosity
                            
                            # CRITICAL: Cap penalty to prevent numerical explosion
                            E_skel = mat.effyoungsModulus or 10000.0
                            nu_skel = mat.poissonsRatio or 0.3
                            K_skel = E_skel / (3.0 * (1.0 - 2.0 * nu_skel))
                            # Reduce cap to 5x for better stability
                            if penalty > 5.0 * K_skel:
                                penalty = 5.0 * K_skel
                            
                            # Add volumetric penalty to D matrix
                            D_tan[0,0] += penalty
                            D_tan[0,1] += penalty
                            D_tan[1,0] += penalty
                            D_tan[1,1] += penalty
                            temp_tangent_matrices[eid] = D_tan
                            
                            # Compute Excess PWP from volumetric strain
                            # CRITICAL SIGN CONVENTION:
                            # Compression → d_vol_strain < 0
                            # PWP should INCREASE in compression (become more negative)
                            # du_excess should be NEGATIVE when d_vol_strain is NEGATIVE
                            # Therefore: du_excess = +penalty * d_vol_strain (NO MINUS SIGN!)
                            d_vol_strain = d_epsilon_step[0] + d_epsilon_step[1]
                            du_excess = penalty * d_vol_strain  # FIXED: removed minus sign
                            pwp_excess_new = pwp_excess_start + du_excess
                        else:
                            # Drained: No PWP change, no penalty
                            temp_tangent_matrices[eid] = D_alg
                            pwp_excess_new = pwp_excess_start
                        
                        # Recombine to Total Stress
                        pwp_vec_new = np.array([pwp_static + pwp_excess_new, pwp_static + pwp_excess_new, 0.0])
                        sigma_total_new = sigma_eff_new + pwp_vec_new
                    
                    temp_phase_stress[eid] = sigma_total_new
                    temp_phase_yield[eid] = yld_new
                    temp_phase_strain[eid] = epsilon_total_cand
                    temp_phase_pwp_excess[eid] = pwp_excess_new
                    
                    # Internal Force Integration (Uses Total Stress)
                    f_int_el = ep['B'].T @ sigma_total_new * ep['area']
                    for li, n in enumerate(nodes_e):
                        F_int[n*2:n*2+2] += f_int_el[li*2:li*2+2]
                
                # Global Residual
                # R = F_int_initial + target_m_stage * delta_F_external - F_int
                R = F_int_initial + (target_m_stage * delta_F_external) - F_int
                
                R_free = R[free_dofs]
                norm_R = np.linalg.norm(R_free)
                f_base = np.linalg.norm((F_int_initial + delta_F_external)[free_dofs])
                if f_base < 1.0: f_base = 1.0
                
                # Detailed convergence diagnostics (only log every 10 iterations or if failing)
                if iteration % 10 == 0 or iteration >= settings.max_iterations - 5:
                    norm_du = np.linalg.norm(step_du)
                    rel_res = norm_R / f_base
                    max_stress = max(np.linalg.norm(s) for s in temp_phase_stress.values()) if temp_phase_stress else 0
                    max_strain = max(np.linalg.norm(s) for s in temp_phase_strain.values()) if temp_phase_strain else 0
                    # msg_debug = f"  Iter {iteration}: ||R||={norm_R:.2e}, rel_R={rel_res:.2e}, ||du||={norm_du:.2e}, max_σ={max_stress:.1f}, max_ε={max_strain:.4f}"
                    # log.append(msg_debug)
                    # yield {"type": "log", "content": msg_debug}
                    # print(msg_debug)
                
                if norm_R / f_base < settings.tolerance and iteration > 1:
                    converged = True
                    break
                
                # === Rebuild Stiffness Matrix with Latest Tangent (CRITICAL FOR CONVERGENCE) ===
                # Must rebuild K after stress update because plasticity changes D_tan
                K_global.fill(0.0)
                for ep in active_elem_props:
                    eid = ep['id']
                    # Use updated tangent from this iteration
                    if eid in temp_tangent_matrices:
                        D_tan = temp_tangent_matrices[eid]
                    else:
                        D_tan = element_tangent_matrices[eid]
                    
                    nodes_e = ep['nodes']
                    K_el_tan = ep['B'].T @ D_tan @ ep['B'] * ep['area'] * 1.0
                    
                    for li in range(3):
                        gi = nodes_e[li]
                        for lj in range(3):
                            gj = nodes_e[lj]
                            K_global[gi*2:gi*2+2, gj*2:gj*2+2] += K_el_tan[li*2:li*2+2, lj*2:lj*2+2]
                
                K_free = K_global[np.ix_(free_dofs, free_dofs)]
                
                # Linear Step
                try:
                    du_free = np.linalg.solve(K_free, R_free)
                    step_du[free_dofs] += du_free
                except np.linalg.LinAlgError:
                    msg_sing = f"{get_error_info(ErrorCode.SOLVER_SINGULAR_MATRIX)}"
                    log.append(msg_sing)
                    yield {"type": "log", "content": msg_sing}
                    converged = False
                    break
            
            if converged:
                step_count += 1
                current_u_incremental += step_du
                current_m_stage = target_m_stage
                # Update local state for next MStage step - store converged TOTAL stress
                for eid, stress in temp_phase_stress.items(): phase_stress_history[eid] = stress
                for eid, strain in temp_phase_strain.items(): phase_strain_history[eid] = strain
                for eid, yld in temp_phase_yield.items(): phase_yield_history[eid] = yld
                for eid, pexc in temp_phase_pwp_excess.items(): phase_pwp_excess_history[eid] = pexc
                
                u_reshaped = current_u_incremental.reshape(-1, 2)
                magnitudes = np.sqrt(u_reshaped[:,0]**2 + u_reshaped[:,1]**2)
                max_disp = np.max(magnitudes)
                max_disp = np.float64(np.max(magnitudes))
                m_type = "MStage" if not is_srm else "Msf"
                msg = f"Phase {phase.name} | Step {step_count}: {m_type} {current_m_stage:.4f} | Max Incremental Disp: {max_disp:.6f} m | Iterations {iteration}"
                log.append(msg)
                yield {"type": "log", "content": msg}
                
                pt = {"m_stage": float(current_m_stage), "max_disp": float(max_disp)}
                phase_step_points.append(pt)
                yield {"type": "step_point", "content": pt}

                print(msg) 

                if iteration < settings.min_desired_iterations: step_size *= 1.2 # Limit growth
                elif iteration > settings.max_desired_iterations: step_size *= 0.5
                
                # Update Tangent Matrices for Next Step (Implicitly handled by rebuild at start of next step loop)
                for eid, D_tan in temp_tangent_matrices.items():
                    element_tangent_matrices[eid] = D_tan

            else:
                m_type = "MStage" if not is_srm else "Msf"
                msg = f"Phase {phase.name} | {m_type} Attempt {step_count+1} at {target_m_stage:.4f} FAILED. Iterations {iteration}. Reducing step size..."
                log.append(msg)
                print(msg)
                
                # Load Control: Cutback
                # Adjust minimum step size to get bigger displacements
                if step_size > (1e-4 if not is_srm else 0.001):
                     step_size *= 0.5
                     # Retry without advancing step_count
                     continue
                else:
                    log.append(f"Step size too small ({step_size:.5f}). Aborting phase.")
                    break

        # End of Phase
        # Store Results (Success or partial failure state)
        # We use the current best known state (last converged increment)
        # Note: total_displacement is cumulative PARENT state. 
        # total_displacement + current_u_incremental is the current cumulative state.
        
        # Calculate resulting total displacement state
        final_u_total = total_displacement + current_u_incremental
        
        p_displacements = []
        for i in range(num_nodes):
            p_displacements.append(NodeResult(id=i+1, ux=final_u_total[i*2], uy=final_u_total[i*2+1]))
        
        p_stresses = []
        for ep in active_elem_props:
            eid = ep['id']
            # Use history (last converged) if present, else placeholder
            sig = phase_stress_history.get(eid, element_stress_state.get(eid, np.zeros(3)))
            yld = phase_yield_history.get(eid, element_yield_state.get(eid, False))
            
            # Calculate Out-of-Plane Stress (Sigma ZZ)
            # Plane Strain Condition: epsilon_zz = 0
            # Effective Law: sigma'_zz = nu * (sigma'_xx + sigma'_yy)
            # Total Law: sigma_zz = sigma'_zz + pwp = nu * (sigma_xx + sigma_yy - 2*pwp) + pwp
            
            # Total PWP = Static (Steady) + Excess
            pwp_excess = phase_pwp_excess_history.get(eid, element_pwp_excess_state.get(eid, 0.0))
            pwp_total = (ep['pwp'] or 0.0) + pwp_excess
            
            sig_xx_total = sig[0]
            sig_yy_total = sig[1]
            nu = ep['material'].poissonsRatio
            
            # Sigma ZZ Calculation
            # For Total Stress Analysis (Undrained B/C, Non-Porous): sig_zz = nu * (sig_xx + sig_yy)
            # For Effective Stress Analysis (Drained, Undrained A): sig_zz = sig'_zz + pwp = nu * (sig'_xx + sig'_yy) + pwp
            dtype = ep['material'].drainage_type
            if dtype in [DrainageType.NON_POROUS, DrainageType.UNDRAINED_C, DrainageType.UNDRAINED_B]:
                 sig_zz_val = nu * (sig_xx_total + sig_yy_total)
            else:
                 # Effective stress basis: sigma'_xx = sigma_xx - pwp
                 sig_zz_val = nu * (sig_xx_total + sig_yy_total - 2*pwp_total) + pwp_total

            p_stresses.append(StressResult(
                element_id=eid, sig_xx=sig[0], sig_yy=sig[1], sig_xy=sig[2],
                sig_zz=sig_zz_val,
                pwp=pwp_total, is_yielded=yld, m_stage=current_m_stage
            ))
        
        success = (not is_srm and current_m_stage >= 0.999) or (is_srm and current_m_stage > 1.0)
        error_msg = None
        if not success:
            error_msg = f"Phase failed at step {step_count} (MStage/MSF: {current_m_stage:.3f})."
            if current_m_stage < 0.001 and iteration >= settings.max_iterations:
                error_msg = f"Phase failed at the FIRST step. Convergence not reached (Residual too high)."
            elif is_srm and current_m_stage <= 1.0:
                error_msg = f"Safety Analysis failed to reach MSF > 1.0. The initial state might be unstable."

        phase_details = {
            'phase_id': phase.id,
            'success': success,
            'displacements': p_displacements,
            'stresses': p_stresses,
            'pwp': [((ep['pwp'] or 0.0) + phase_pwp_excess_history.get(ep['id'], 0.0)) for ep in active_elem_props],
            'reached_m_stage': current_m_stage,
            'step_points': phase_step_points,
            'step_failed_at': step_count if not success else None,
            'error': error_msg
        }
        phase_results.append(phase_details)
        yield {"type": "phase_result", "content": phase_details}

        if success:
            # Handle displacement accumulation based on phase configuration
            # Per doc Section 11.1: u_total = Σ Δu_phase (unless explicitly reset)
            if phase.reset_displacements:
                # Reset mode: This phase starts from zero displacement
                # Only store the incremental displacement from this phase
                total_displacement = current_u_incremental
            else:
                # Accumulation mode (default): Add incremental to previous total
                total_displacement = final_u_total
            
            # Update global element states
            for eid in phase_stress_history: 
                element_stress_state[eid] = phase_stress_history[eid]
                element_strain_state[eid] = phase_strain_history[eid]
                element_yield_state[eid] = phase_yield_history[eid]
                if eid in phase_pwp_excess_history: element_pwp_excess_state[eid] = phase_pwp_excess_history[eid]
            log.append(f"Phase {phase.name} completed successfully.")
        else:
            log.append(f"Phase {phase.name} failed at step {step_count}. Returning partial results.")
            break

    yield {"type": "final", "content": {
        "success": all(pr['success'] for pr in phase_results),
        "phases": phase_results,
        "log": log
    }}
