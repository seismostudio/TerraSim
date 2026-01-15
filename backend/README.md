# CST FEA Analysis Program - Soil Analysis

Program Python untuk penyelesaian FEA menggunakan elemen CST (Constant Strain Triangle) untuk analisis tanah dengan input data terpisah dan visualisasi hasil dalam window.

## Struktur Program

### Modul Utama:
- **`input_data.py`** - Berisi data geometri, properti tanah, dan kondisi batas
- **`cst_element.py`** - Implementasi elemen CST dengan perhitungan tanah
- **`fea_solver.py`** - Solver FEA yang merakit matriks global dan menyelesaikan sistem
- **`visualization.py`** - Modul visualisasi untuk menampilkan mesh dan kontur tanah
- **`main.py`** - Program utama yang menjalankan seluruh analisis tanah

## Fitur Analisis Tanah

### FEA Analysis:
- Elemen CST (Constant Strain Triangle) untuk analisis 2D tanah
- Plane strain analysis (ketebalan 1 m)
- Perhitungan settlement, effective stress, dan safety factor
- Analisis stabilitas tanah menggunakan kriteria Mohr-Coulomb
- Beban gravitasi tanah (self-weight)
- Beban fondasi

### Visualisasi:
- Tampilan mesh dengan penomoran node
- Kontur plot untuk berbagai hasil tanah:
  - Settlement (penurunan)
  - Effective stress (tegangan efektif)
  - Safety factor (faktor keamanan)
  - Principal stresses (tegangan utama)
  - Normal stresses (σx, σy)
  - Shear stress (τxy)
  - Strains (εx, εy, γxy)
- Window interaktif dengan kontrol plot
- Colorbar untuk interpretasi nilai

## Satuan Geoteknik

Program menggunakan satuan standar geoteknik:
- **Unit weight**: kN/m³
- **Beban**: kN
- **Modulus elastisitas**: kN/m²
- **Cohesion**: kN/m²
- **Tegangan**: kN/m²
- **Settlement**: m
- **Ketebalan**: 1 m (plane strain)

## Instalasi

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Jalankan program:
```bash
python main.py
```

## Input Data Tanah

### Geometri:
- Koordinat node (x, y) dalam meter
- Konektivitas elemen (node1, node2, node3)
- 9 node dan 15 elemen CST
- Dimensi 2m x 2m

### Properti Tanah (Clay):
- Young's modulus: 50,000 kN/m² (50 MPa)
- Poisson's ratio: 0.35
- Unit weight: 18.0 kN/m³
- Cohesion: 50 kN/m²
- Friction angle: 25°
- Thickness: 1.0 m (plane strain)

### Boundary Conditions:
- Fixed nodes: Node 1, 2, 6 (bottom boundary)
- Applied forces (beban fondasi):
  - Node 3: 100 kN downward
  - Node 4: 150 kN downward
  - Node 9: 75 kN downward
- Gravity loads: Yes (beban gravitasi tanah)
- Water table: 1.5 m from bottom

## Output Analisis Tanah

### Console Output:
- Ringkasan properti tanah
- Status analisis
- Hasil maksimum settlement dan stress
- Safety factor minimum
- Assessment stabilitas tanah
- Assessment settlement

### Visualization Window:
- Plot mesh dengan kontrol radio button
- Kontur plot dengan colorbar
- Kontrol deformation scale
- Interaktif untuk melihat berbagai hasil tanah

## Cara Menggunakan

1. **Modifikasi Input Data**: Edit file `input_data.py` untuk mengubah:
   - Geometri (koordinat node dan konektivitas elemen)
   - Properti tanah (modulus, cohesion, friction angle, unit weight)
   - Kondisi batas (fixed nodes, applied forces)

2. **Jalankan Analisis**: 
   ```bash
   python main.py
   ```

3. **Lihat Hasil**:
   - Console akan menampilkan ringkasan hasil tanah
   - Window visualisasi akan terbuka
   - Gunakan radio button untuk melihat berbagai plot
   - Kontur plot menampilkan distribusi settlement, stress, dan safety factor

## Teori CST Element untuk Tanah

### Shape Functions:
Untuk elemen CST, fungsi bentuk linear:
- N₁ = (1 - ξ - η)
- N₂ = ξ
- N₃ = η

### Strain-Displacement Matrix:
B matrix menghubungkan strain dengan nodal displacements:
ε = B * u

### Stiffness Matrix (Plane Strain):
K = B^T * D * B * A * t
dimana:
- B: strain-displacement matrix
- D: constitutive matrix (plane strain)
- A: element area
- t: thickness (1 m)

### Mohr-Coulomb Failure Criterion:
σ₁ = σ₃ * tan²(45° + φ/2) + 2c * tan(45° + φ/2)
dimana:
- σ₁: major principal stress
- σ₃: minor principal stress
- φ: friction angle
- c: cohesion

## Dependencies

- numpy: Perhitungan numerik
- matplotlib: Plotting dan visualisasi
- scipy: Interpolasi untuk contour plot
- tkinter: GUI window (built-in Python)

## Struktur File

```
FEA Python/
├── main.py              # Program utama
├── input_data.py        # Data input tanah
├── cst_element.py       # Implementasi elemen CST untuk tanah
├── fea_solver.py        # Solver FEA untuk analisis tanah
├── visualization.py     # Modul visualisasi tanah
├── requirements.txt     # Dependencies
└── README.md           # Dokumentasi
```

## Contoh Hasil Analisis Tanah

Program akan menampilkan:
1. Mesh dengan 9 node dan 15 elemen CST
2. Distribusi settlement (penurunan)
3. Distribusi effective stress
4. Safety factor untuk stabilitas tanah
5. Principal stresses
6. Assessment stabilitas dan settlement
7. Ringkasan nilai maksimum dan lokasinya

## Kriteria Stabilitas dan Settlement

### Stabilitas Tanah:
- **STABLE**: Safety factor > 1.5
- **MARGINALLY STABLE**: 1.0 < Safety factor < 1.5
- **UNSTABLE**: Safety factor < 1.0

### Settlement:
- **ACCEPTABLE**: < 25 mm
- **MODERATE**: 25-50 mm
- **EXCESSIVE**: > 50 mm

## Catatan

- Program menggunakan penalty method untuk boundary conditions
- Analisis plane strain (εz = 0)
- Elemen CST memberikan strain konstan dalam setiap elemen
- Visualisasi menggunakan interpolasi grid untuk contour plot yang smooth
- Perhitungan safety factor menggunakan kriteria Mohr-Coulomb
- Beban gravitasi tanah otomatis diperhitungkan 