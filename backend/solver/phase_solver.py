"""
Phase Solver Module
Main FEA solver loop implementing M-Stage load advancement and Newton-Raphson iteration.
Handles multiple analysis phases including K0 procedure, plastic analysis, and safety analysis.
"""
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

import scipy.sparse as sp
from scipy.sparse.linalg import spsolve

from numba import njit
from .element_t6 import compute_element_matrices_t6, GAUSS_WEIGHTS
from .k0_procedure import compute_vertical_stress_k0_t6
from .plasticity import mohr_coulomb_yield, return_mapping_mohr_coulomb


@njit
def assemble_stiffness_values_numba(
    active_elem_D_tangent_arr, # (N, 3, 3, 3) - 3 GPs
    B_matrices_arr,
    det_J_arr,
    weights_arr
):
    num_active = len(active_elem_D_tangent_arr)
    # Total values = N * 12 * 12
    K_values = np.zeros(num_active * 144)
    thickness = 1.0
    
    for i in range(num_active):
        K_el = np.zeros((12, 12))
        for gp_idx in range(3):
            B = B_matrices_arr[i, gp_idx]
            D = active_elem_D_tangent_arr[i, gp_idx]
            det_J = det_J_arr[i, gp_idx]
            weight = weights_arr[gp_idx]
            K_el += (B.T @ D @ B) * det_J * weight * thickness
        
        K_values[i*144 : (i+1)*144] = K_el.flatten()
        
    return K_values


@njit
def compute_elements_stresses_numba(
    element_nodes_arr,
    total_u_candidate,
    step_start_stress_arr,
    step_start_strain_arr,
    step_start_pwp_arr,
    B_matrices_arr,
    det_J_arr,
    weights_arr,
    D_elastic_arr,
    pwp_static_arr,
    mat_drainage_arr, 
    mat_model_arr, # 0: LinearElastic, 1: MohrCoulomb
    mat_c_arr,
    mat_phi_arr,
    mat_su_arr,
    penalties_arr,
    is_srm,
    target_m_stage,
    num_dof
):
    F_int = np.zeros(num_dof)
    num_active = len(element_nodes_arr)
    
    new_stresses = np.zeros((num_active, 3, 3))
    new_yield = np.zeros((num_active, 3), dtype=np.bool_)
    new_strain = np.zeros((num_active, 3, 3))
    new_pwp_excess = np.zeros((num_active, 3))
    
    thickness = 1.0
    
    for i in range(num_active):
        nodes_e = element_nodes_arr[i]
        
        u_el = np.zeros(12)
        for li in range(6):
            n_idx = nodes_e[li]
            u_el[li*2] = total_u_candidate[n_idx*2]
            u_el[li*2+1] = total_u_candidate[n_idx*2+1]
        
        f_int_el = np.zeros(12)
        
        dtype = mat_drainage_arr[i]
        mmodel = mat_model_arr[i]
        D_el = D_elastic_arr[i]
        c_val = mat_c_arr[i]
        phi_val = mat_phi_arr[i]
        su_val = mat_su_arr[i]
        penalty_val = penalties_arr[i]
        
        for gp_idx in range(3):
            B_gp = B_matrices_arr[i, gp_idx]
            det_J = det_J_arr[i, gp_idx]
            weight = weights_arr[gp_idx]
            p_static = pwp_static_arr[i, gp_idx]
            
            epsilon_total = B_gp @ u_el
            start_strain = step_start_strain_arr[i, gp_idx]
            d_epsilon_step = epsilon_total - start_strain
            
            sigma_total_start = step_start_stress_arr[i, gp_idx]
            pwp_excess_start = step_start_pwp_arr[i, gp_idx]
            
            if dtype == 3: # UNDRAINED_C
                sigma_total_trial = sigma_total_start + D_el @ d_epsilon_step
                su_eff = su_val
                if is_srm: su_eff /= target_m_stage
                
                if mmodel == 1: # Mohr-Coulomb
                    sig_new, _, yld = return_mapping_mohr_coulomb(
                        sigma_total_trial[0], sigma_total_trial[1], sigma_total_trial[2],
                        su_eff, 0.0, D_el
                    )
                else:
                    sig_new = sigma_total_trial
                    yld = False
                p_exc_new = 0.0
            
            elif dtype == 1 or dtype == 2: # UNDRAINED_A or B
                D_total = D_el.copy()
                D_total[0,0] += penalty_val; D_total[0,1] += penalty_val
                D_total[1,0] += penalty_val; D_total[1,1] += penalty_val
                
                sigma_total_trial = sigma_total_start + D_total @ d_epsilon_step
                d_vol = d_epsilon_step[0] + d_epsilon_step[1]
                p_exc_new = pwp_excess_start + penalty_val * d_vol
                p_total = p_static + p_exc_new
                
                sigma_eff_trial = sigma_total_trial - np.array([p_total, p_total, 0.0])
                
                if mmodel == 1:
                    c_eff = c_val; phi_eff = phi_val
                    if dtype == 2: 
                        c_eff = su_val
                        phi_eff = 0.0
                    
                    if is_srm:
                        c_eff /= target_m_stage
                        if phi_eff > 0:
                            phi_rad = np.deg2rad(phi_eff)
                            phi_eff = np.rad2deg(np.arctan(np.tan(phi_rad) / target_m_stage))
                    
                    sig_eff_new, _, yld = return_mapping_mohr_coulomb(
                        sigma_eff_trial[0], sigma_eff_trial[1], sigma_eff_trial[2],
                        c_eff, phi_eff, D_el
                    )
                else:
                    sig_eff_new = sigma_eff_trial
                    yld = False
                sig_new = sig_eff_new + np.array([p_total, p_total, 0.0])
                
            else: # DRAINED or NON_POROUS
                sigma_eff_start = sigma_total_start - np.array([p_static, p_static, 0.0])
                sigma_eff_trial = sigma_eff_start + D_el @ d_epsilon_step
                
                if mmodel == 1:
                    c_eff = c_val; phi_eff = phi_val
                    if is_srm:
                        c_eff /= target_m_stage
                        if phi_eff > 0:
                            phi_rad = np.deg2rad(phi_eff)
                            phi_eff = np.rad2deg(np.arctan(np.tan(phi_rad) / target_m_stage))
                    
                    sig_eff_new, _, yld = return_mapping_mohr_coulomb(
                        sigma_eff_trial[0], sigma_eff_trial[1], sigma_eff_trial[2],
                        c_eff, phi_eff, D_el
                    )
                else:
                    sig_eff_new = sigma_eff_trial
                    yld = False
                p_exc_new = 0.0
                sig_new = sig_eff_new + np.array([p_static, p_static, 0.0])

            new_stresses[i, gp_idx] = sig_new
            new_yield[i, gp_idx] = yld
            new_strain[i, gp_idx] = epsilon_total
            new_pwp_excess[i, gp_idx] = p_exc_new
            
            f_int_el += B_gp.T @ sig_new * det_J * weight * thickness
            
        for li in range(6):
            gi = nodes_e[li]
            F_int[gi*2] += f_int_el[li*2]
            F_int[gi*2+1] += f_int_el[li*2+1]
            
    return F_int, new_stresses, new_yield, new_strain, new_pwp_excess


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
    if len(mesh.elements) > 4000:
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

    # Pre-calculate all element matrices (Initial state) - T6 Elements
    for i, elem_nodes in enumerate(elements):
        elem_id = i + 1
        # Find element metadata
        elem_meta = next((em for em in mesh.element_materials if em.element_id == elem_id), None)
        if not elem_meta: continue
        
        mat = elem_meta.material
        poly_id = elem_meta.polygon_id
        
        # T6 elements have 6 nodes
        if len(elem_nodes) != 6:
            log.append(f"ERROR: Element {elem_id} does not have 6 nodes (T6 required). Skipping.")
            continue
            
        coords = np.array([nodes[n] for n in elem_nodes])  # (6, 2)
        K_el, F_grav, gauss_point_data, D = compute_element_matrices_t6(coords, mat, water_level=water_level_data)
        
        if K_el is None: continue
        
        # Calculate element area (using first 3 corner nodes)
        c = coords[:3]
        area = 0.5 * abs(c[0][0]*(c[1][1]-c[2][1]) + c[1][0]*(c[2][1]-c[0][1]) + c[2][0]*(c[0][1]-c[1][1]))
            
        elem_props_all.append({
            'id': elem_id,
            'nodes': elem_nodes,
            'D': D,
            'K': K_el,
            'F_grav': F_grav,
            'material': mat,
            'polygon_id': poly_id,
            'gauss_points': gauss_point_data,  # List of 3 Gauss point dicts
            'area': area,
            'original_material': mat
        })

    # Global State Tracking - T6: Store state per Gauss Point (List of 3 items per element)
    total_displacement = np.zeros(num_dof)
    element_stress_state = {ep['id']: [np.zeros(3) for _ in range(3)] for ep in elem_props_all}
    element_strain_state = {ep['id']: [np.zeros(3) for _ in range(3)] for ep in elem_props_all}
    element_yield_state = {ep['id']: [False for _ in range(3)] for ep in elem_props_all}
    element_pwp_excess_state = {ep['id']: [0.0 for _ in range(3)] for ep in elem_props_all}
    
    phase_results = []
    
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

        # 0. RESET MATERIAL STATE (Fix for persistence bug)
        # For non-Safety Analysis phases, revert elements to their original material first.
        # This prevents overrides from previous phases leaking into future phases.
        # Safety Analysis phases MUST inherit the material state (including overrides) from their parent phase.
        if phase.phase_type != PhaseType.SAFETY_ANALYSIS:
            reset_count = 0
            for ep in elem_props_all:
                if ep['material'].id != ep['original_material'].id:
                    orig_mat = ep['original_material']
                    # Recompute Element Matrices with ORIGINAL material
                    coords = np.array([nodes[n] for n in ep['nodes']])
                    K_el, F_grav, gauss_point_data, D = compute_element_matrices_t6(coords, orig_mat, water_level=water_level_data)
                    
                    if K_el is not None:
                        ep['K'] = K_el
                        ep['F_grav'] = F_grav
                        ep['D'] = D
                        ep['material'] = orig_mat
                        ep['gauss_points'] = gauss_point_data
                        reset_count += 1
            if reset_count > 0:
                msg_reset = f"Reset {reset_count} elements to original material."
                log.append(msg_reset)
                yield {"type": "log", "content": msg_reset}
        
        # 1. Identify Active/Inactive Elements
        active_elem_props = [ep for ep in elem_props_all if ep['polygon_id'] in phase.active_polygon_indices]
        active_ids = {ep['id'] for ep in active_elem_props}
        
        # 2. Identify Active Nodes
        active_node_indices = set()
        for ep in active_elem_props:
            for n_idx in ep['nodes']:
                active_node_indices.add(n_idx)

        # 2.5 Handle Material Overrides
        if phase.material_overrides:
            material_map = {m.id: m for m in request.materials}
            overide_count = 0
            for poly_idx_str, mat_id in phase.material_overrides.items():
                poly_idx = int(poly_idx_str)
                new_mat = material_map.get(mat_id)
                
                if not new_mat:
                    log.append(f"WARNING: Material override ID {mat_id} for polygon {poly_idx} not found in request materials.")
                    continue
                
                # Update all elements belonging to this polygon
                affected_eps = [ep for ep in elem_props_all if ep['polygon_id'] == poly_idx]
                
                if not affected_eps:
                    log.append(f"WARNING: No elements found for polygon index {poly_idx} to override.")
                    continue
                    
                msg_override = f"Overriding material for Polygon {poly_idx}: New Material '{new_mat.name}' ({new_mat.id})"
                log.append(msg_override)
                yield {"type": "log", "content": msg_override}
                print(msg_override)
                
                for ep in affected_eps:
                    # Recompute Element Matrices with NEW material
                    coords = np.array([nodes[n] for n in ep['nodes']])
                    K_el, F_grav, gauss_point_data, D = compute_element_matrices_t6(coords, new_mat, water_level=water_level_data)
                    
                    if K_el is not None:
                        ep['K'] = K_el
                        ep['F_grav'] = F_grav
                        ep['D'] = D
                        ep['material'] = new_mat
                        ep['gauss_points'] = gauss_point_data
                        
                        # Reset state for this element? 
                        # Ideally, stresses should be carried over? 
                        # If material changes (e.g. concrete hardening), stiffness changes, but existing stress remains?
                        # Usually K0 or previous phase stress is valid.
                        # But D matrix changes, so next increment will use new stiffness.
                        # Yes, this is correct for "Staged Construction".
                        
                overide_count += 1
            
            if overide_count > 0:
                # Re-select active_elem_props to ensure they have the updated pointers (they should already, as dicts are mutable)
                active_elem_props = [ep for ep in elem_props_all if ep['polygon_id'] in phase.active_polygon_indices]

        # Handle K0 Procedure
        if phase.phase_type == PhaseType.K0_PROCEDURE:
            msg_k0 = "Running K0 Procedure for stress initialization (T6)..."
            log.append(msg_k0)
            yield {"type": "log", "content": msg_k0}
            print(msg_k0)
            
            # T6 K0 Procedure returns stress per Gauss point
            k0_stresses = compute_vertical_stress_k0_t6(active_elem_props, nodes, water_level_data)
            
            # Update global state
            for eid, gp_stresses in k0_stresses.items():
                # gp_stresses is dict {'gp1': array, ...}
                # Store as list [gp1_stress, gp2_stress, gp3_stress]
                element_stress_state[eid] = [
                    gp_stresses[f'gp{i+1}'] for i in range(3)
                ]
                # Strain remains zero
                element_strain_state[eid] = [np.zeros(3) for _ in range(3)]
                element_yield_state[eid] = [False for _ in range(3)]
            
            # Reset Displacements (K0 procedure generates stress without deformation)
            total_displacement = np.zeros(num_dof)
            
            # Create Result Object
            p_displacements = [NodeResult(id=i+1, ux=0.0, uy=0.0) for i in range(num_nodes)]
            p_stresses = []
            
            for ep in active_elem_props:
                eid = ep['id']
                # Loop over Gauss points
                for i in range(3):
                    gp_data = ep['gauss_points'][i]
                    sig = element_stress_state[eid][i]
                    pwp_val = gp_data['pwp']
                    
                    sig_zz = sig[0] 
                    
                    p_stresses.append(StressResult(
                        element_id=eid, 
                        gp_id=i+1,
                        sig_xx=sig[0], sig_yy=sig[1], sig_xy=sig[2],
                        sig_zz=sig_zz, 
                        pwp_steady=pwp_val,
                        pwp_total=pwp_val,
                        is_yielded=False, m_stage=1.0
                    ))
            
            phase_results.append({
                'phase_id': phase.id,
                'success': True,
                'displacements': p_displacements,
                'stresses': p_stresses,
                'pwp': [], # Aggregate PWP? Maybe skip or average. For now empty is safe as StressResult has it.
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
        # 3. Sparse Indices Pre-calculation
        rows = []
        cols = []
        for ep in active_elem_props:
            nodes_e = ep['nodes']
            dofs = []
            for n in nodes_e:
                dofs.extend([n*2, n*2+1])
            for r_dof in dofs:
                for c_dof in dofs:
                    rows.append(r_dof)
                    cols.append(c_dof)
        active_row_indices = np.array(rows, dtype=np.int32)
        active_col_indices = np.array(cols, dtype=np.int32)

        # 4. Standard FEA Steps (Plastic, Gravity Loading, Consolidation, etc.)
        # Build initial stiffness (Linear Elastic)
        K_values = []
        for ep in active_elem_props:
            K_values.extend(ep['K'].flatten())
        K_global = sp.coo_matrix((K_values, (active_row_indices, active_col_indices)), shape=(num_dof, num_dof)).tocsr()
        
        # 4. Apply Boundary Conditions
        fixed_dofs = set()
        for bc in mesh.boundary_conditions.full_fixed:
            fixed_dofs.add(bc.node * 2)
            fixed_dofs.add(bc.node * 2 + 1)
        
        xs = [p[0] for p in nodes]; min_x, max_x = min(xs), max(xs)
        for bc in mesh.boundary_conditions.normal_fixed:
            nx = nodes[bc.node][0]
            if abs(nx - min_x) < 1e-3 or abs(nx - max_x) < 1e-3:
                fixed_dofs.add(bc.node * 2)
        
        free_dofs = []
        for d in range(num_dof):
            node_idx = d // 2
            if d not in fixed_dofs and node_idx in active_node_indices:
                free_dofs.append(d)
        free_dofs = np.array(free_dofs, dtype=np.int32)
        
        # Initial matrices will be sliced in the loop for efficiency if using direct solvers.
        # But slicing CSR is relatively fast.
        
        # 5. Calculate Incremental Forces (Delta F)
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
                for li in range(6):
                    gi = ep['nodes'][li]
                    delta_F_external[gi*2:gi*2+2] += ep['F_grav'][li*2:li*2+2]
            elif was_active_before and not is_active_now:
                # Deactivated -> Subtract its gravity (it's gone)
                for li in range(6):
                    gi = ep['nodes'][li]
                    delta_F_external[gi*2:gi*2+2] -= ep['F_grav'][li*2:li*2+2]
                    
        # B. Stress Release from Deactivated Elements (Excavation)
        for ep in elem_props_all:
            poly_id = ep['polygon_id']
            if poly_id in parent_active_indices and poly_id not in current_active_indices:
                eid = ep['id']
                # Iterate over Gauss points to integrate internal force
                f_int_el = np.zeros(12)
                gp_stresses = element_stress_state[eid]
                
                for gp_idx in range(3):
                    sigma_gp = gp_stresses[gp_idx]
                    gp_data = ep['gauss_points'][gp_idx]
                    weight = gp_data['weight']
                    det_J = gp_data['det_J']
                    B_gp = gp_data['B']
                    
                    # f = B^T * sigma * detJ * weight * thickness
                    f_int_el += B_gp.T @ sigma_gp * det_J * weight * 1.0 # thickness=1
                
                for li in range(6):
                    gi = ep['nodes'][li]
                    # We ADD the release force because the boundary is now MISSING 
                    # the support from this element.
                    delta_F_external[gi*2:gi*2+2] += f_int_el[li*2:li*2+2]
        
        # C. Point/Line Load Changes
        current_load_vectors = np.zeros(num_dof)
        parent_load_vectors = np.zeros(num_dof)
        
        # Point Loads
        pl_map = {pl.id: pl for pl in (request.point_loads or [])}
        pl_assignment_map = {a.point_load_id: a.assigned_node_id - 1 for a in mesh.point_load_assignments}
        
        # Line Loads
        ll_map = {ll.id: ll for ll in (request.line_loads or [])}
        ll_assignment_map = {}
        for la in (mesh.line_load_assignments or []):
            if la.line_load_id not in ll_assignment_map:
                ll_assignment_map[la.line_load_id] = []
            ll_assignment_map[la.line_load_id].append(la)
            
        def apply_all_loads(active_ids, target_vector):
            # Apply Point Loads
            for lid in active_ids:
                if lid in pl_map and lid in pl_assignment_map:
                    pl = pl_map[lid]
                    n_idx = pl_assignment_map[lid]
                    target_vector[n_idx*2] += pl.fx
                    target_vector[n_idx*2+1] += pl.fy
                
                # Apply Line Loads
                if lid in ll_map and lid in ll_assignment_map:
                    ll = ll_map[lid]
                    for la in ll_assignment_map[lid]:
                        # edge_nodes: [n1, n2, n3] 1-based
                        n1, n2, n3 = la.edge_nodes[0]-1, la.edge_nodes[1]-1, la.edge_nodes[2]-1
                        p1, p2 = np.array(mesh.nodes[n1]), np.array(mesh.nodes[n2])
                        L = np.linalg.norm(p2 - p1)
                        # Quadratic edge distribution (parabolic): 1/6, 1/6, 2/3
                        f_total = np.array([ll.fx, ll.fy]) * L
                        target_vector[n1*2 : n1*2+2] += f_total / 6.0
                        target_vector[n2*2 : n2*2+2] += f_total / 6.0
                        target_vector[n3*2 : n3*2+2] += f_total * (2.0/3.0)

        # Calculate current and parent states
        apply_all_loads(phase.active_load_ids, current_load_vectors)
        if parent_phase:
            apply_all_loads(parent_phase.active_load_ids, parent_load_vectors)
        
        delta_F_external += (current_load_vectors - parent_load_vectors)
        
        # 5. Out-of-Balance Forces (Internal Stress vs External Load) - Initial F_int
        F_int_initial = np.zeros(num_dof)
        for ep in active_elem_props:
            eid = ep['id']
            gp_stresses = element_stress_state[eid]
            f_int_el = np.zeros(12)
            
            for gp_idx in range(3):
                sigma_gp = gp_stresses[gp_idx]
                gp_data = ep['gauss_points'][gp_idx]
                weight = gp_data['weight']
                det_J = gp_data['det_J']
                B_gp = gp_data['B']
                f_int_el += B_gp.T @ sigma_gp * det_J * weight * 1.0
            
            for li in range(6):
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
        # Copy list of lists
        phase_stress_history = {eid: [s.copy() for s in ls] for eid, ls in element_stress_state.items()}
        phase_strain_history = {eid: [s.copy() for s in ls] for eid, ls in element_strain_state.items()}
        phase_yield_history = {eid: [y for y in ls] for eid, ls in element_yield_state.items()}
        phase_pwp_excess_history = {eid: [p for p in ls] for eid, ls in element_pwp_excess_state.items()}
        
        # Tangent Stiffness Matrix cache (List of 3 matrices per element)
        element_tangent_matrices = {}
        for ep in active_elem_props:
            D_init_gps = []
            mat = ep['material']
            for gp_idx in range(3):
                D_gp = ep['D'].copy()
                if mat.drainage_type in [DrainageType.UNDRAINED_A, DrainageType.UNDRAINED_B]:
                    # Add volumetric stiffening (Penalty Bulk Modulus of Water)
                    # For Undrained A/B using effective modulus, we stiffen the tangent
                    Kw = 2.2e6 # kPa
                    porosity = 0.3
                    penalty = Kw / porosity
                    E_skel = mat.effyoungsModulus or 10000.0
                    nu_skel = mat.poissonsRatio or 0.3
                    K_skel = E_skel / (3.0 * (1.0 - 2.0 * nu_skel))
                    if penalty > 10.0 * K_skel: penalty = 10.0 * K_skel # Safety limit
                    
                    D_gp[0,0] += penalty
                    D_gp[0,1] += penalty
                    D_gp[1,0] += penalty
                    D_gp[1,1] += penalty
                
                D_init_gps.append(D_gp)
            element_tangent_matrices[ep['id']] = D_init_gps
        
        log.append(f"Solving equilibrium for phase {phase.name}...")

        # Prepare Static Arrays for Numba Optimization
        num_active_phase = len(active_elem_props)
        elem_nodes_arr = np.array([ep['nodes'] for ep in active_elem_props], dtype=np.int32)
        B_matrices_arr = np.array([[gp['B'] for gp in ep['gauss_points']] for ep in active_elem_props])
        det_J_arr = np.array([[gp['det_J'] for gp in ep['gauss_points']] for ep in active_elem_props])
        pwp_static_arr = np.array([[gp['pwp'] or 0.0 for gp in ep['gauss_points']] for ep in active_elem_props])
        weights_arr = GAUSS_WEIGHTS
        D_elastic_arr = np.array([ep['D'] for ep in active_elem_props])
        
        # Drainage mapping: 0: DRAINED, 1: UNDRAINED_A, 2: UNDRAINED_B, 3: UNDRAINED_C, 4: NON_POROUS
        drainage_map = {
            DrainageType.DRAINED: 0,
            DrainageType.UNDRAINED_A: 1,
            DrainageType.UNDRAINED_B: 2,
            DrainageType.UNDRAINED_C: 3,
            DrainageType.NON_POROUS: 4
        }
        mat_drainage_arr = np.array([drainage_map.get(ep['material'].drainage_type, 0) for ep in active_elem_props], dtype=np.int32)
        mat_c_arr = np.array([ep['material'].cohesion or 0.0 for ep in active_elem_props])
        mat_phi_arr = np.array([ep['material'].frictionAngle or 0.0 for ep in active_elem_props])
        mat_su_arr = np.array([ep['material'].undrainedShearStrength or 0.0 for ep in active_elem_props])
        
        penalties_arr = []
        for ep in active_elem_props:
            mat = ep['material']
            penalty = 0.0
            if mat.drainage_type in [DrainageType.UNDRAINED_A, DrainageType.UNDRAINED_B]:
                Kw = 2.2e6; porosity = 0.3; penalty = Kw / porosity
                E_skel = mat.effyoungsModulus or 10000.0
                nu_skel = mat.poissonsRatio or 0.3
                K_skel = E_skel / (3.0 * (1.0 - 2.0 * nu_skel))
                if penalty > 10.0 * K_skel: penalty = 10.0 * K_skel
            penalties_arr.append(penalty)
        penalties_arr = np.array(penalties_arr)

        # Material model mapping: 0: LINEAR_ELASTIC, 1: MOHR_COULOMB
        model_map = {
            MaterialModel.LINEAR_ELASTIC: 0,
            MaterialModel.MOHR_COULOMB: 1
        }
        mat_model_arr = np.array([model_map.get(ep['material'].material_model, 0) for ep in active_elem_props], dtype=np.int32)

        while (not is_srm and current_m_stage < 1.0) or (is_srm and current_m_stage < 100.0): 
            if should_stop and should_stop():
                log.append("Analysis cancelled by user during MStage loop.")
                yield {"type": "log", "content": "Analysis cancelled by user."}
                break
            
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
                target_m_stage = current_m_stage + step_size
            
            # Snapshot state at START of this step
            step_start_stress = {eid: [s.copy() for s in ls] for eid, ls in phase_stress_history.items()}
            step_start_strain = {eid: [s.copy() for s in ls] for eid, ls in phase_strain_history.items()}
            step_start_pwp = {eid: [p for p in ls] for eid, ls in phase_pwp_excess_history.items()}
            
            # Snapshot arrays for Numba
            step_start_stress_arr = np.array([step_start_stress[ep['id']] for ep in active_elem_props])
            step_start_strain_arr = np.array([step_start_strain[ep['id']] for ep in active_elem_props])
            step_start_pwp_arr = np.array([step_start_pwp[ep['id']] for ep in active_elem_props])

            # Newton-Raphson
            iteration = 0
            converged = False
            step_du = np.zeros(num_dof) 
            
            while iteration < settings.max_iterations:
                iteration += 1
                
                total_u_candidate = total_displacement + current_u_incremental + step_du
                
                # Call Numba Kernel for Internal Forces and Stress Update
                F_int, new_stresses_arr, new_yield_arr, new_strain_arr, new_pwp_excess_arr = compute_elements_stresses_numba(
                    elem_nodes_arr,
                    total_u_candidate,
                    step_start_stress_arr,
                    step_start_strain_arr,
                    step_start_pwp_arr,
                    B_matrices_arr,
                    det_J_arr,
                    weights_arr,
                    D_elastic_arr,
                    pwp_static_arr,
                    mat_drainage_arr,
                    mat_model_arr,
                    mat_c_arr,
                    mat_phi_arr,
                    mat_su_arr,
                    penalties_arr,
                    is_srm,
                    target_m_stage,
                    num_dof
                )
                
                # Re-map collections for results consistency
                temp_phase_stress = {} 
                temp_phase_yield = {}
                temp_phase_strain = {}
                temp_phase_pwp_excess = {}
                for i, ep in enumerate(active_elem_props):
                    eid = ep['id']
                    temp_phase_stress[eid] = [new_stresses_arr[i, gp] for gp in range(3)]
                    temp_phase_yield[eid] = [new_yield_arr[i, gp] for gp in range(3)]
                    temp_phase_strain[eid] = [new_strain_arr[i, gp] for gp in range(3)]
                    temp_phase_pwp_excess[eid] = [new_pwp_excess_arr[i, gp] for gp in range(3)]
                
                # Global Residual
                R = F_int_initial + (target_m_stage * delta_F_external) - F_int
                R_free = R[free_dofs]
                norm_R = np.linalg.norm(R_free)
                f_base = np.linalg.norm((F_int_initial + delta_F_external)[free_dofs])
                if f_base < 1.0: f_base = 1.0

                if norm_R / f_base < settings.tolerance and iteration > 1:
                    converged = True
                    break
                
                # Rebuild Stiffness Matrix (Sparse Assembly) - JIT Optimized
                # Using element_tangent_matrices (Modified Newton-Raphson) for stability
                active_elem_D_tangent_arr = np.array([element_tangent_matrices[ep['id']] for ep in active_elem_props])
                K_values = assemble_stiffness_values_numba(
                    active_elem_D_tangent_arr,
                    B_matrices_arr,
                    det_J_arr,
                    weights_arr
                )
                
                K_global = sp.coo_matrix((K_values, (active_row_indices, active_col_indices)), shape=(num_dof, num_dof)).tocsr()
                K_free = K_global[free_dofs, :][:, free_dofs]
                
                try:
                    du_free = spsolve(K_free, R_free)
                    step_du[free_dofs] += du_free
                except Exception as e:
                    print(f"DEBUG: Solver error at Iter {iteration}: {str(e)}")
                    log.append(f"Solver Error: {str(e)}")
                    converged = False
                    break
            
            if converged:
                step_count += 1
                current_u_incremental += step_du
                current_m_stage = target_m_stage
                
                for eid, stress in temp_phase_stress.items(): phase_stress_history[eid] = stress
                for eid, strain in temp_phase_strain.items(): phase_strain_history[eid] = strain
                for eid, yld in temp_phase_yield.items(): phase_yield_history[eid] = yld
                for eid, pexc in temp_phase_pwp_excess.items(): phase_pwp_excess_history[eid] = pexc
                
                u_reshaped = current_u_incremental.reshape(-1, 2)
                magnitudes = np.sqrt(u_reshaped[:,0]**2 + u_reshaped[:,1]**2)
                max_disp = np.float64(np.max(magnitudes))
                m_type = "MStage" if not is_srm else "Msf"
                msg = f"Phase {phase.name} | Step {step_count}: {m_type} {current_m_stage:.4f} | Max Incremental Disp: {max_disp:.6f} m | Iterations {iteration}"
                log.append(msg)
                yield {"type": "log", "content": msg}
                
                pt = {"m_stage": float(current_m_stage), "max_disp": float(max_disp)}
                phase_step_points.append(pt)
                yield {"type": "step_point", "content": pt}
                print(msg) 
                
                if iteration < settings.min_desired_iterations: step_size *= 1.2
                elif iteration > settings.max_desired_iterations: step_size *= 0.5

            else:
                msg = f"Phase {phase.name} failed. Reducing step size..."
                log.append(msg)
                print(msg)
                if step_size > (1e-4 if not is_srm else 0.001):
                     step_size *= 0.5
                     continue
                else:
                    log.append(f"Step size too small ({step_size:.5f}). Aborting phase.")
                    break

        # End of Phase Result Gathering
        final_u_total = total_displacement + current_u_incremental
        p_displacements = []
        for i in range(num_nodes):
            p_displacements.append(NodeResult(id=i+1, ux=final_u_total[i*2], uy=final_u_total[i*2+1]))
        
        p_stresses = []
        for ep in active_elem_props:
            eid = ep['id']
            # Get list of Gauss point states
            sig_list = phase_stress_history.get(eid, element_stress_state.get(eid, [np.zeros(3)]*3))
            yld_list = phase_yield_history.get(eid, element_yield_state.get(eid, [False]*3))
            pwp_excess_list = phase_pwp_excess_history.get(eid, element_pwp_excess_state.get(eid, [0.0]*3))
            
            for gp_idx in range(3):
                gp_data = ep['gauss_points'][gp_idx]
                sig = sig_list[gp_idx]
                yld = yld_list[gp_idx]
                pwp_excess = pwp_excess_list[gp_idx]
                
                pwp_static = gp_data['pwp'] or 0.0
                pwp_total = pwp_static + pwp_excess
                
                sig_xx_total = sig[0]
                sig_yy_total = sig[1]
                nu = ep['material'].poissonsRatio
                
                dtype = ep['material'].drainage_type
                if dtype in [DrainageType.NON_POROUS, DrainageType.UNDRAINED_C]:
                     sig_zz_val = nu * (sig_xx_total + sig_yy_total)
                else:
                     sig_zz_val = nu * (sig_xx_total + sig_yy_total - 2*pwp_total) + pwp_total
    
                p_stresses.append(StressResult(
                    element_id=eid, 
                    gp_id=gp_idx+1,
                    sig_xx=sig[0], sig_yy=sig[1], sig_xy=sig[2],
                    sig_zz=sig_zz_val,
                    pwp_steady=pwp_static,
                    pwp_excess=pwp_excess,
                    pwp_total=pwp_total,
                    is_yielded=yld, m_stage=current_m_stage
                ))
        
        success = (not is_srm and current_m_stage >= 0.999) or (is_srm and current_m_stage > 1.0)
        error_msg = None
        if not success:
            error_msg = f"Phase failed at step {step_count}."

        phase_details = {
            'phase_id': phase.id,
            'success': success,
            'displacements': p_displacements,
            'stresses': p_stresses,
            'pwp': [], # Skipped for now
            'reached_m_stage': current_m_stage,
            'step_points': phase_step_points,
            'step_failed_at': step_count if not success else None,
            'error': error_msg
        }
        phase_results.append(phase_details)
        yield {"type": "phase_result", "content": phase_details}

        if success:
            if phase.reset_displacements:
                total_displacement = current_u_incremental
            else:
                total_displacement = final_u_total
            
            for eid in phase_stress_history: 
                element_stress_state[eid] = phase_stress_history[eid]
                element_strain_state[eid] = phase_strain_history[eid]
                element_yield_state[eid] = phase_yield_history[eid]
                if eid in phase_pwp_excess_history: element_pwp_excess_state[eid] = phase_pwp_excess_history[eid]
            log.append(f"Phase {phase.name} completed successfully.")
        else:
            log.append(f"Phase {phase.name} failed at step {step_count}.")
            break

    yield {"type": "final", "content": {
        "success": all(pr['success'] for pr in phase_results),
        "phases": phase_results,
        "log": log
    }}
