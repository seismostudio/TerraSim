# 📘 Dokumentasi Lengkap: Transfer Kondisi Awal antar Phase dalam Staged Construction FEA

## 🧭 DAFTAR ISI
1. Pendahuluan dan Tujuan
2. Definisi dan Konsep Dasar
3. Alur Umum Analisis Multi-Phase
4. Rincian Mekanisme Transfer Kondisi
5. Struktur Data Fase
6. Contoh Numerik Sederhana
7. Urutan Perhitungan di Setiap Phase
8. Catatan Implementasi di TerraSim
9. Penutup dan Rekomendasi

---

## 1. 🎯 Pendahuluan dan Tujuan

Dokumen ini menjelaskan secara komprehensif mekanisme *transfer kondisi awal antar phase* dalam analisis bertahap (*staged construction*) pada metode elemen hingga (FEM/FEA). Konsep ini digunakan dalam software seperti PLAXIS dan akan dijadikan referensi untuk pengembangan di **TerraSim**.

---

## 2. 🧠 Definisi dan Konsep Dasar

### ✅ Staged Construction
Analisis bertahap di mana elemen struktur dan tanah ditambahkan, dihapus, atau dimodifikasi secara bertahap sesuai urutan konstruksi.

### ✅ Transfer Kondisi Awal
Setiap phase baru mewarisi kondisi hasil dari phase sebelumnya, yaitu:
- Tegangan (stress)
- Regangan (strain)
- Tekanan pori (jika fully coupled)
- Titik plastis (plastic points)
- Displacement total

Namun **geometri mesh tidak berubah** antar phase (masih pakai undeformed geometry).

---

## 3. 🔁 Alur Umum Analisis Multi-Phase

```
Phase 0: Inisialisasi kondisi tegangan awal (K0 atau gravitasi)
Phase 1: Penambahan beban / elemen → hitung ∆σ
Phase 2: Perubahan geometri / boundary → gunakan σ1 sebagai initial
Phase 3: Tambah beban lagi → lanjut dari σ2
...
```

Setiap fase:
- Membaca **hasil akhir phase sebelumnya** sebagai kondisi awal
- Menambahkan perubahan baru: beban, elemen, atau boundary
- Melakukan solve FEM

---

## 4. 🧩 Rincian Mekanisme Transfer Kondisi

### 📌 Yang Diturunkan dari Phase Sebelumnya:
| Variabel             | Ditransfer? | Catatan                     |
|----------------------|------------|-----------------------------|
| Tegangan (σ)         | ✅         | Elemen yang tetap aktif     |
| Tekanan pori (u)     | ✅         | Jika analisis coupled       |
| Displacement total   | ✅         | Untuk visualisasi dan strain |
| Plastic points       | ✅         | Untuk path-dependent model |
| Geometri             | ❌         | Mesh tetap tidak berubah    |

### 📌 Elemen Baru yang Diaktifkan:
- Kondisi awalnya **nol**, tidak menerima transfer tegangan.
- Diperlakukan seolah baru dimasukkan.

---

## 5. 🗃️ Struktur Data Fase

Setiap fase sebaiknya memiliki struktur data seperti:
```json
{
  "id": 2,
  "name": "Phase 2",
  "active_elements": [...],
  "applied_loads": [...],
  "boundary_conditions": [...],
  "initial_stress": [...], // dari phase sebelumnya
  "initial_displacement": [...],
  "plastic_points": [...]
}
```

---

## 6. 🔢 Contoh Numerik Sederhana

### Dua Elemen CST (3-node):
- Material: E = 10000 kPa, ν = 0.3
- Ketebalan: 1 m
- Phase 1: Beban q = 10 kPa diberikan di elemen atas
- Phase 2: Tambah beban q = 10 kPa lagi dan aktifkan elemen bawah

### Fase 1:
- Hitung strain dan stress dari beban pertama pada elemen 1:
  ```
  ∆σ = D · B · ∆u
  σ1 = ∆σ
  ```

### Fase 2:
- Elemen 1:
  ```
  σ2 = σ1 + ∆σ (akibat beban tambahan)
  ```
- Elemen 2 (baru aktif):
  ```
  σ2 = ∆σ (tanpa σ1 karena tidak aktif sebelumnya)
  ```

---

## 7. ⚙️ Urutan Perhitungan Setiap Phase

1. Ambil hasil dari phase sebelumnya: σ, ε, u, etc.
2. Terapkan perubahan: aktifkan elemen, ubah batas, tambahkan beban.
3. Hitung beban eksternal baru → f_ext
4. Lakukan solve iteratif:
   ```
   K ∆u = f_ext - f_int
   ```
5. Hitung:
   ```
   ∆ε = B · ∆u
   ∆σ = D(∆ε - ∆ε_p)
   σ_new = σ_old + ∆σ
   ```
6. Update total displacement, plastic points, dll.

---

## 8. 🧱 Catatan Implementasi di TerraSim

- Pastikan struktur data menyimpan hasil per elemen dan per node setelah setiap fase.
- Buat mekanisme pembacaan hasil phase sebelumnya saat membuat phase baru.
- Hindari perubahan ID elemen atau node agar mapping kondisi tetap konsisten.
- Gunakan cache atau snapshot array stress/strain saat keluar dari phase.
- Pisahkan antara **initial state** dan **current state** di solver.

---

## 9. 🧩 Penutup dan Rekomendasi

Transfer kondisi antar fase sangat penting untuk analisis non-linier bertahap, seperti:
- Galian berlapis
- Penimbunan timbunan
- Konstruksi dinding penahan tanah
- Excavation dengan tahapan dewatering

### 🚀 Pengembangan Lanjutan:
- Tambahkan fitur visualisasi per phase
- Tambahkan kontrol manual untuk interpolasi tegangan awal
- Simpan history curve tiap elemen atau titik

Jika dibutuhkan, simulasi numerik manual atau kode Python bisa dilampirkan sebagai lampiran tambahan.

---

📄 **Dokumen ini dapat dijadikan sebagai acuan untuk desain struktur internal TerraSim yang modular dan future-proof.**

