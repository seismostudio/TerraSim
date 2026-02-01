# Solver Documentation

This document details the Finite Element Analysis (FEA) solver implemented in TerraSim. It covers the element formulation, constitutive models, and the nonlinear solution strategy.

## 1. Element Formulation: T6 Quadratic Triangle

The core discretization unit is the 6-node quadratic triangle (T6). This element provides second-order accuracy, capturing linear strain variations within the element.

### Shape Functions
For a triangle with natural coordinates $(\xi, \eta, \zeta)$ where $\zeta = 1 - \xi - \eta$, the shape functions are:

$$
\begin{aligned}
N_1 &= \zeta(2\zeta - 1) \\
N_2 &= \xi(2\xi - 1) \\
N_3 &= \eta(2\eta - 1) \\
N_4 &= 4\zeta\xi \quad (\text{Midpoint } 1-2)\\
N_5 &= 4\xi\eta \quad (\text{Midpoint } 2-3)\\
N_6 &= 4\eta\zeta \quad (\text{Midpoint } 3-1)
\end{aligned}
$$

### Numerical Integration
We use **3-point Gauss Quadrature** for numerical integration of stiffness matrices and internal force vectors.
- Points: $(\frac{1}{6}, \frac{1}{6}), (\frac{2}{3}, \frac{1}{6}), (\frac{1}{6}, \frac{2}{3})$
- Weights: $\frac{1}{6}$ for all points.

### B-Matrix (Strain-Displacement)
The strain vector $\epsilon = [\epsilon_{xx}, \epsilon_{yy}, \gamma_{xy}]^T$ is related to nodal displacements $u$ by $\epsilon = B u$.
The $B$ matrix is constructed from the derivatives of shape functions w.r.t physical coordinates $(x,y)$, obtained via the geometric Jacobian $J$.

## 2. Constitutive Models

### Linear Elasticity
Used for `LINEAR_ELASTIC` materials and initial stiffness logic.
$$
\sigma = D_{elastic} \epsilon
$$
Where $D_{elastic}$ is the plane-strain elasticity matrix derived from Young's Modulus ($E$) and Poisson's Ratio ($\nu$).

### Mohr-Coulomb Plasticity
Used for `MOHR_COULOMB` materials. Ideally elastic-perfectly plastic.
- **Yield Function ($f$)**: 
  $$
  f = \frac{\sigma_1 - \sigma_3}{2} + \frac{\sigma_1 + \sigma_3}{2} \sin\phi - c \cos\phi
  $$
- **Return Mapping**: Implemented using the radial return algorithm (closest point projection) in principal stress space.
- **Tension Cut-off**: Explicit cap on tensile principal stress based on cohesion and friction angle.

## 3. Solver Architecture

The solver uses a **Modified Newton-Raphson** scheme with **M-Stage** load advancement.

### Global Equilibrium Equation
$$
F_{ext} - F_{int}(u) = 0
$$

Where:
- $F_{ext}$: External nodal forces (Gravity, Point Loads, Line Loads).
- $F_{int}$: Internal nodal forces integrated from element stresses.
$$
F_{int} = \int_{V} B^T \sigma dV
$$

### Algorithm Flow
1.  **Phase Initialization**: Calculate incremental external force $\Delta F_{ext}$.
2.  **M-Stage Loop**: Apply load fraction $\Sigma M_{stage}$ from 0.0 to 1.0.
    - Update Target Force: $F_{target} = F_{initial} + \Sigma M_{stage} \cdot \Delta F_{ext}$
    - **Newton-Raphson Iterations**:
        1.  Compute Residual: $R = F_{target} - F_{int}(u_{trial})$
        2.  Check Convergence: $||R|| < \text{tol}$
        3.  Solve system: $K_{tan} \Delta u = R$
        4.  Update Displacement: $u_{new} = u_{old} + \Delta u$
        5.  Update Stresses (Return Mapping).
3.  **Step Size Adaptation**: Automatically reduce step size if convergence fails; increase if convergence is fast.

### Safety Analysis (SRM)
For `SAFETY_ANALYSIS` phases, the "load" is the reduction of strength parameters ($c, \phi$).
- Target: Find the factor $F_S$ such that the system fails.
- $c_{trial} = c / F_S$
- $\tan \phi_{trial} = \tan \phi / F_S$
- The solver drives $F_S$ (represented as $\Sigma M_{sf}$) until non-convergence.

## 4. K0 Procedure
Before the main analysis, the **K0 Procedure** initializes the stress state for horizontal (flat) layers.
1.  **Vertical Stress ($\sigma_v'$)**: Integrated from surface downwards using unit weights ($\gamma_{unsat}$ or $\gamma_{sat}$).
2.  **Horizontal Stress ($\sigma_h'$)**: Calculated as $\sigma_h' = K_0 \cdot \sigma_v'$.
    - $K_0 = 1 - \sin \phi$ (Jaky's formula) or derived from Poisson's ratio.
3.  **Pore Water Pressure**: Hydrostatic distribution based on the phreatic level.

This creates a self-weight equilibrium state without generating displacements.
