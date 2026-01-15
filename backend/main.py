"""
Main Program for CST FEA Analysis - Soil Analysis
Loads input data, runs analysis, and displays results for geotechnical analysis
"""

import numpy as np
from input_data import load_input_data
from fea_solver import FEASolver
from visualization import FEAVisualizer

def main():
    """Main function to run the soil FEA analysis"""
    print("=== CST FEA Analysis Program - Soil Analysis ===")
    print("Loading input data...")
    
    # Load input data
    geometry, material, boundary_conditions = load_input_data()
    
    print(f"Geometry loaded: {geometry.num_nodes} nodes, {geometry.num_elements} elements")
    print(f"Soil properties:")
    print(f"  - Young's modulus: {material.young_modulus:.0f} kN/m²")
    print(f"  - Poisson's ratio: {material.poisson_ratio}")
    print(f"  - Unit weight: {material.unit_weight:.1f} kN/m³")
    print(f"  - Cohesion: {material.cohesion:.0f} kN/m²")
    print(f"  - Friction angle: {material.friction_angle:.1f}°")
    print(f"  - Thickness (plane strain): {material.thickness:.1f} m")
    
    print(f"Boundary conditions:")
    print(f"  - Fixed nodes: {[i+1 for i in boundary_conditions.fixed_nodes]}")
    print(f"  - Applied forces: {len(boundary_conditions.applied_forces)} foundation loads")
    print(f"  - Gravity loads: {'Yes' if boundary_conditions.gravity_loads else 'No'}")
    print(f"  - Water table: {boundary_conditions.water_table:.1f} m from bottom")
    
    # Create and run FEA solver
    print("\nRunning soil FEA analysis...")
    solver = FEASolver(geometry, material, boundary_conditions)
    
    try:
        displacements = solver.solve()
        print("Analysis completed successfully!")
        
        # Get results
        element_results = solver.get_element_results()
        nodal_displacements = solver.get_nodal_displacements()
        soil_results = solver.get_soil_specific_results()
        
        # Print summary results
        print("\n=== Soil Analysis Results Summary ===")
        max_displacement = max([d['magnitude'] for d in nodal_displacements])
        max_settlement = max([abs(d['v']) for d in nodal_displacements])
        
        print(f"Maximum displacement: {max_displacement:.6f} m")
        print(f"Maximum settlement: {max_settlement:.6f} m")
        print(f"Maximum effective stress: {soil_results['max_effective_stress']:.2f} kN/m²")
        print(f"Maximum principal stress: {soil_results['max_principal_stress']:.2f} kN/m²")
        # print(f"Maximum pore water pressure: {soil_results['max_pore_water_pressure']:.2f} kN/m²")
        print(f"Minimum safety factor: {soil_results['min_safety_factor']:.2f}")
        
        # ✅ Print stress history if available
        stress_history_summary = solver.get_stress_history_summary()
        if stress_history_summary:
            print(f"\n=== STRESS HISTORY ANALYSIS ===")
            print(f"Stage type: {stress_history_summary['stage_type']}")
            print(f"Initial stress max σ₁: {stress_history_summary['initial_stress_summary']['max_sigma_1']:.2f} kPa")
            print(f"Incremental stress max σ₁: {stress_history_summary['incremental_stress_summary']['max_sigma_1']:.2f} kPa")
            print(f"Final stress max σ₁: {stress_history_summary['final_stress_summary']['max_sigma_1']:.2f} kPa")
            print(f"Stress increase: {stress_history_summary['incremental_stress_summary']['max_sigma_1']:.2f} kPa")
            print(f"Stress evolution: {stress_history_summary['initial_stress_summary']['max_sigma_1']:.2f} → {stress_history_summary['final_stress_summary']['max_sigma_1']:.2f} kPa")
        
        # ✅ Print stress evolution report if available
        stress_evolution_report = solver.get_stress_evolution_report()
        if stress_evolution_report:
            print(f"\n=== STRESS EVOLUTION REPORT ===")
            print(f"Total elements: {stress_evolution_report['total_elements']}")
            print(f"Elements with stress increase: {stress_evolution_report['stress_evolution_summary']['elements_with_stress_increase']}")
            print(f"Elements with stress decrease: {stress_evolution_report['stress_evolution_summary']['elements_with_stress_decrease']}")
            print(f"Elements with no change: {stress_evolution_report['stress_evolution_summary']['elements_with_no_change']}")
            print(f"Max stress increase: {stress_evolution_report['stress_evolution_summary']['max_stress_increase']:.2f} kPa")
            print(f"Max stress decrease: {stress_evolution_report['stress_evolution_summary']['max_stress_decrease']:.2f} kPa")
            print(f"Average stress change: {stress_evolution_report['stress_evolution_summary']['average_stress_change']:.2f} kPa")
        
        # ✅ Print PWP history if available
        pwp_history_summary = solver.get_pwp_history_summary()
        if pwp_history_summary:
            print(f"\n=== PWP HISTORY ANALYSIS ===")
            print(f"Stage type: {pwp_history_summary['stage_type']}")
            print(f"Hydrostatic PWP max: {pwp_history_summary['hydrostatic_pwp_summary']['max_pwp']:.2f} kPa")
            print(f"Excess PWP max: {pwp_history_summary['excess_pwp_summary']['max_pwp']:.2f} kPa")
            print(f"Total PWP max: {pwp_history_summary['total_pwp_summary']['max_pwp']:.2f} kPa")
            print(f"Excess PWP contribution: {pwp_history_summary['excess_pwp_summary']['max_pwp']:.2f} kPa")
            print(f"PWP evolution: {pwp_history_summary['hydrostatic_pwp_summary']['max_pwp']:.2f} → {pwp_history_summary['total_pwp_summary']['max_pwp']:.2f} kPa")
        
        # Find node with maximum settlement
        max_settlement_node = max(nodal_displacements, key=lambda x: abs(x['v']))
        print(f"Node with max settlement: Node {max_settlement_node['node_id']+1}")
        print(f"  Settlement = {abs(max_settlement_node['v']):.6f} m")
        
        # Find element with minimum safety factor
        min_safety_elem = min(element_results, key=lambda x: x['safety_factor'])
        print(f"Element with min safety factor: Element {min_safety_elem['element_id']+1}")
        print(f"  Safety factor = {min_safety_elem['safety_factor']:.2f}")
        
        # Print surface settlements
        print(f"\nSurface settlements:")
        for i, settlement in enumerate(soil_results['surface_settlements']):
            print(f"  Node {i+1}: {settlement:.6f} m")
        
        # Stability assessment
        print(f"\n=== Stability Assessment ===")
        if soil_results['min_safety_factor'] > 1.5:
            print("✓ Soil is STABLE (Safety factor > 1.5)")
        elif soil_results['min_safety_factor'] > 1.0:
            print("⚠ Soil is MARGINALLY STABLE (1.0 < Safety factor < 1.5)")
        else:
            print("✗ Soil is UNSTABLE (Safety factor < 1.0)")
        
        # Settlement assessment
        print(f"\n=== Settlement Assessment ===")
        if max_settlement < 0.025:  # 25 mm
            print("✓ Settlement is ACCEPTABLE (< 25 mm)")
        elif max_settlement < 0.050:  # 50 mm
            print("⚠ Settlement is MODERATE (25-50 mm)")
        else:
            print("✗ Settlement is EXCESSIVE (> 50 mm)")
        
        # Prepare results for visualization
        solver_results = {
            'element_results': element_results,
            'nodal_displacements': nodal_displacements,
            'displacements': displacements,
            'soil_results': soil_results
        }
        
        # Create and run visualization
        print("\nOpening visualization window...")
        visualizer = FEAVisualizer(geometry, solver_results)
        visualizer.run()
        
    except Exception as e:
        print(f"Error during analysis: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main() 