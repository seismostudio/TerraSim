"""
Plasticity Module - Mohr-Coulomb Implementation
Implements yield function and return mapping algorithm for elasto-plastic analysis
"""
import numpy as np
from typing import Tuple

def mohr_coulomb_yield(sig_xx: float, sig_yy: float, sig_xy: float, 
                       c: float, phi: float) -> float:
    """
    Calculate Mohr-Coulomb yield function value.
    
    Args:
        sig_xx, sig_yy, sig_xy: Stress components (kN/m²)
        c: Cohesion (kN/m²)
        phi: Friction angle (degrees)
    
    Returns:
        f: Yield function value
           f < 0 → Elastic (safe)
           f = 0 → On yield surface
           f > 0 → Inadmissible (plastic, needs return mapping)
    
    Formula:
        f = (σ_max - σ_min) + (σ_max + σ_min)·sin(φ) - 2c·cos(φ)
        where σ is tensile-positive.
    """
    # Convert phi to radians
    phi_rad = np.deg2rad(phi)
    sin_phi = np.sin(phi_rad)
    cos_phi = np.cos(phi_rad)
    
    # Calculate principal stresses using Mohr's circle (MATHEMATICAL CONVENTION)
    # Note: In Geotechnical engineering (Plaxis), Sigma 1 is the most negative (compressive).
    # Here we use sig_math_max and sig_math_min to avoid confusion.
    s_avg = (sig_xx + sig_yy) / 2.0
    radius = np.sqrt(((sig_xx - sig_yy) / 2.0)**2 + sig_xy**2)
    
    sig_math_max = s_avg + radius  # Mathematically largest principal stress
    sig_math_min = s_avg - radius  # Mathematically smallest principal stress
    
    # Mohr-Coulomb yield criterion (Tensile Positive Convention)
    # f = (σ_max - σ_min) + (σ_max + σ_min)·sin(φ) - 2c·cos(φ)
    # Explanation:
    #   We want confinement (negative center) to INCREASE strength.
    #   If (sig_max + sig_min) is negative, then adding sin_phi * (sig_max + sig_min)
    #   makes f smaller (safer).
    f = (sig_math_max - sig_math_min) + (sig_math_max + sig_math_min) * sin_phi - 2.0 * c * cos_phi
    
    return f


def return_mapping_mohr_coulomb(
    sig_xx_trial: float, 
    sig_yy_trial: float, 
    sig_xy_trial: float,
    c: float, 
    phi: float,
    D_elastic: np.ndarray
) -> Tuple[np.ndarray, np.ndarray, bool]:
    """
    Return mapping algorithm for Mohr-Coulomb plasticity (radial return method).
    
    If trial stress violates yield surface (f > 0), projects it back to yield surface.
    This is a SIMPLIFIED radial return - full algorithm is more complex.
    
    Args:
        sig_xx_trial, sig_yy_trial, sig_xy_trial: Trial elastic stress (kN/m²)
        c: Cohesion (kN/m²)
        phi: Friction angle (degrees)
        D_elastic: Elastic constitutive matrix (3x3)
    
    Returns:
        sigma_corrected: Corrected stress vector [sig_xx, sig_yy, sig_xy] (3,)
        D_tangent: Tangent stiffness matrix (3x3) - reduced for plastic
        is_plastic: True if plasticity occurred
    """
    sigma_trial = np.array([sig_xx_trial, sig_yy_trial, sig_xy_trial])
    
    # Check yield
    f_trial = mohr_coulomb_yield(sig_xx_trial, sig_yy_trial, sig_xy_trial, c, phi)
    
    if f_trial <= 1e-6:  # Elastic (small tolerance for numerical errors)
        return sigma_trial, D_elastic, False
    
    # PLASTIC: Need to return to yield surface
    # Simplified radial return (approximation)
    # Full algorithm requires: df/dsigma, consistency condition, etc.
    
    phi_rad = np.deg2rad(phi)
    sin_phi = np.sin(phi_rad)
    cos_phi = np.cos(phi_rad)
    
    # Principal stresses of trial
    s_avg_trial = (sig_xx_trial + sig_yy_trial) / 2.0
    radius_trial = np.sqrt(((sig_xx_trial - sig_yy_trial) / 2.0)**2 + sig_xy_trial**2)
    
    # q = 2 * radius = (s1 - s3)
    # p = s_avg = (s1 + s3) / 2
    # f = q + 2*p*sin - 2*c*cos = 0
    # q_target = 2*c*cos - 2*p*sin
    
    p_trial = s_avg_trial
    q_target = 2.0 * c * cos_phi - 2.0 * p_trial * sin_phi
    
    # Tension Cut-off / Apex Handling
    # If q_target is negative, it means the center p is so far in tension 
    # that no diameter is possible. We cap q_target at 0 and potentially p.
    if q_target < 0:
        q_target = 0.0
        # Optional: Bring p back to apex (p_max = c * cot(phi))
        # For simplicity, we just zero the stress if it's too far in tension
        s_avg_trial = min(s_avg_trial, (c * cos_phi / (sin_phi + 1e-9)) if sin_phi > 0 else 1e9)

    # Scale down radius
    if radius_trial > 1e-9:
        scale_factor = q_target / (2.0 * radius_trial)
        scale_factor = max(0.0, min(scale_factor, 1.0))  # Ensure non-negative and capped at 1
    else:
        scale_factor = 0.0
    
    radius_corrected = radius_trial * scale_factor
    
    # Reconstruct sig_xx, sig_yy, sig_xy with new radius
    # Preserve stress direction (angle theta)
    if radius_trial > 1e-9:
        cos_2theta = (sig_xx_trial - sig_yy_trial) / (2.0 * radius_trial)
        sin_2theta = sig_xy_trial / radius_trial
    else:
        cos_2theta = 1.0
        sin_2theta = 0.0
    
    sig_xx_corrected = s_avg_trial + radius_corrected * cos_2theta
    sig_yy_corrected = s_avg_trial - radius_corrected * cos_2theta
    sig_xy_corrected = radius_corrected * sin_2theta
    
    sigma_corrected = np.array([sig_xx_corrected, sig_yy_corrected, sig_xy_corrected])
    
    # Tangent modulus (simplified: use elastic for now)
    # Full elasto-plastic tangent requires df/dsigma derivatives
    # This is complex and not critical for Modified Newton-Raphson
    D_tangent = D_elastic  # Use Elastic Stiffness (Modified Newton-Raphson) for stability.
    # D_tangent = D_elastic * 0.5  # Previous approximation caused overflow/instability.
    
    return sigma_corrected, D_tangent, True
