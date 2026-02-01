"""
Solver Package
Modular FEA solver implementation for geotechnical analysis.

Main Components:
- element_cst: CST element stiffness and force computation
- k0_procedure: Geostatic initial stress initialization
- plasticity: Mohr-Coulomb plasticity model
- phase_solver: Main analysis phases solver loop

Usage:
    from backend.solver import solve_phases
"""
from .phase_solver import solve_phases

__all__ = ['solve_phases']
