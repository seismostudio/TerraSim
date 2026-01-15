# Sequential Analysis Integration

## Overview
Frontend telah diintegrasikan dengan API Sequential Analysis yang baru. Sekarang ketika user mengklik "Run Analysis", sistem akan menjalankan sequential analysis menggunakan endpoint `/api/sequential/analyze` daripada menjalankan masing-masing stage secara independen.

## Perubahan yang Dibuat

### 1. **App.tsx - runFEAnalysis Function**
- **Sebelum**: Menjalankan setiap stage secara independen menggunakan `runStageAnalysis`
- **Sesudah**: Menggunakan API sequential analysis yang baru

#### Key Changes:
```typescript
// Sebelum: Loop independen untuk setiap stage
for (let i = 0; i < stages.length; i++) {
    const stageResult = await runStageAnalysis(stage, i, previousResults);
    stageResults.push(stageResult);
}

// Sesudah: Single API call untuk sequential analysis
const sequentialRequest = {
    stages: sequentialStages,
    continue_from_previous: true
};

const response = await fetch(`${API_URL}/api/sequential/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sequentialRequest)
});
```

### 2. **StagingWizard.tsx - Run Analysis Button**
- **Sebelum**: Alert message "Analysis will be run from the Results tab"
- **Sesudah**: Langsung menjalankan `context.runFEAnalysis()`

#### Key Changes:
```typescript
// Sebelum
<button onClick={() => alert('Analysis will be run from the Results tab')}>
    Run Analysis
</button>

// Sesudah
<button 
    onClick={context.runFEAnalysis}
    disabled={context.isAnalyzing}
    className={`... ${context.isAnalyzing ? 'bg-gray-400' : 'bg-blue-500'}`}
>
    {context.isAnalyzing ? 'Running Sequential Analysis...' : 'Run Sequential Analysis'}
</button>
```

### 3. **Data Flow Integration**
Sistem sekarang mengirim data dalam format yang sesuai dengan API sequential:

```typescript
const stageConfig = {
    stage_id: stage.id,
    stage_name: stage.name,
    stage_sequence: i + 1,
    calculation_type: stage.calculationType,
    is_initial_stage: i === 0,
    nodes: nodeList,
    elements: activeElements,
    boundaryConditionsFullFixed: boundaryConditionListFullFixed,
    boundaryConditionsNormalFixed: boundaryConditionListNormalFixed,
    loads: allLoads,
    materials: activeElementMaterials,
    water_level: stageWaterLevel,
    water_level_points: waterLevelPoints,
    interpolation_method: interpolationMethod,
    active_polygons: activePolygonIds,
    active_point_loads: activePointLoads.map(pl => pl.id),
    active_water_levels: activeWaterLevels.map(wl => wl.id)
};
```

## Keuntungan Integrasi

### 1. **Sequential History Management**
- Data dari setiap stage disimpan dalam `SequentialHistory`
- Cumulative data dihitung otomatis
- History dapat diakses melalui API endpoints

### 2. **Better Error Handling**
- Jika satu stage gagal, seluruh analysis berhenti
- Error message yang lebih informatif
- Rollback otomatis jika diperlukan

### 3. **Performance Improvement**
- Single API call daripada multiple calls
- Reduced network overhead
- Better server-side optimization

### 4. **Data Consistency**
- SequentialHistory memastikan konsistensi data antar stage
- Cumulative calculations yang akurat
- Better tracking of changes across stages

## API Endpoints yang Digunakan

### 1. **Sequential Analysis**
```
POST /api/sequential/analyze
```
- Menjalankan sequential analysis untuk semua stages
- Mengembalikan results untuk setiap stage
- Menyimpan data dalam SequentialHistory

### 2. **History Management**
```
GET /api/sequential/history          // Get history
DELETE /api/sequential/history       // Clear history
GET /api/sequential/stage/{stage_id} // Get specific stage
```

## Testing

### Manual Testing
File `test_sequential_integration.ts` tersedia untuk testing manual:

```typescript
// Di browser console:
await testSequentialAPI();    // Test sequential analysis
await testHistoryAPI();       // Test history retrieval
await clearHistoryAPI();      // Test history clearing
```

### Test Data
Test data tersedia dengan 2 stages:
1. **Initial Stage**: K0 analysis untuk kondisi awal
2. **Construction Stage**: FEA analysis dengan applied loads

## Compatibility

### Backward Compatibility
- Format data yang dikirim tetap sama
- Results format tetap kompatibel dengan VisualizationCanvas
- Existing stage configurations tetap berfungsi

### Frontend Components
- **VisualizationCanvas**: Sudah mendukung stage results
- **StagingWizard**: Updated untuk sequential analysis
- **App.tsx**: Main integration point

## Error Handling

### Network Errors
```typescript
if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
}
```

### Analysis Errors
```typescript
if (!sequentialResponse.success) {
    throw new Error(`Sequential analysis failed: ${sequentialResponse.error || sequentialResponse.message}`);
}
```

### User Feedback
- Loading state dengan "Running Sequential Analysis..."
- Disabled button selama analysis
- Alert dengan hasil analysis
- Console logging untuk debugging

## Future Enhancements

### 1. **Real-time Progress**
- WebSocket untuk real-time progress updates
- Progress bar untuk setiap stage
- Live status updates

### 2. **Advanced History Features**
- Export history data
- Compare different analysis runs
- Undo/redo functionality

### 3. **Optimization**
- Parallel processing untuk independent stages
- Caching untuk repeated calculations
- Incremental updates

## Troubleshooting

### Common Issues

1. **API Connection Error**
   - Check if backend server is running
   - Verify API_URL in environment variables
   - Check CORS settings

2. **Stage Configuration Error**
   - Ensure all stages have valid configurations
   - Check material assignments
   - Verify boundary conditions

3. **Memory Issues**
   - Large meshes may require more memory
   - Consider reducing mesh density for testing
   - Monitor server resources

### Debug Information
- Console logs tersedia untuk debugging
- Network tab untuk API call inspection
- SequentialHistory data dapat diakses via API 