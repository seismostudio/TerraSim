"""
Debug script to verify Mohr-Coulomb implementation with negative (compressive) stresses.
"""
import numpy as np
import sys
import os

# Mock the function from plasticity.py locally to test it
def mohr_coulomb_yield(sig_xx, sig_yy, sig_xy, c, phi):
    phi_rad = np.deg2rad(phi)
    sin_phi = np.sin(phi_rad)
    cos_phi = np.cos(phi_rad)
    
    # Mohr circle
    s_avg = (sig_xx + sig_yy) / 2.0
    radius = np.sqrt(((sig_xx - sig_yy) / 2.0)**2 + sig_xy**2)
    
    sig_1 = s_avg + radius
    sig_3 = s_avg - radius
    
    # Current implementation in plasticity.py (FIXED)
    # f = (sig_1 - sig_3) + (sig_1 + sig_3) * sin_phi - 2.0 * c * cos_phi
    f = (sig_1 - sig_3) + (sig_1 + sig_3) * sin_phi - 2.0 * c * cos_phi
    
    return f, sig_1, sig_3

def test_physics():
    c = 5.0
    phi = 20.0
    
    print(f"Material: c={c}, phi={phi}")
    print("-" * 60)
    print(f"{'Stress State':<30} | {'s1':<10} | {'s3':<10} | {'f_val':<10} | {'Status'}")
    print("-" * 60)
    
    # Case 1: Pure Compression (small)
    # sig_yy = -10, sig_xx = -5
    f, s1, s3 = mohr_coulomb_yield(-5, -10, 0, c, phi)
    print(f"{'Small Compression (-5, -10)':<30} | {s1:<10.2f} | {s3:<10.2f} | {f:<10.4f} | {'YIELD' if f>0 else 'Elastic'}")
    
    # Case 2: High Compression (confinement)
    # Soil should get STRONGER. f should decrease (or strictly, the yield envelope moves out)
    # But for a FIXED deviatoric stress, adding confinement should make it safer.
    # Let's keep deviatoric constant: diff = 5.
    # sig_yy = -100, sig_xx = -95.
    f, s1, s3 = mohr_coulomb_yield(-95, -100, 0, c, phi)
    print(f"{'High Compression (-95, -100)':<30} | {s1:<10.2f} | {s3:<10.2f} | {f:<10.4f} | {'YIELD' if f>0 else 'Elastic'}")
    
    # Note: In Case 2, f should be LOWER than Case 1 if confinement helps.
    # Let's see.
    
    # Case 3: Tension (sig_yy = 10)
    f, s1, s3 = mohr_coulomb_yield(5, 10, 0, c, phi)
    print(f"{'Tension (5, 10)':<30} | {s1:<10.2f} | {s3:<10.2f} | {f:<10.4f} | {'YIELD' if f>0 else 'Elastic'}")

if __name__ == "__main__":
    test_physics()
