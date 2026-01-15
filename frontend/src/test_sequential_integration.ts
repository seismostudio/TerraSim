// Test file untuk verifikasi integrasi Sequential Analysis
// File ini bisa dijalankan untuk testing manual

interface TestStage {
    id: string;
    name: string;
    activePolygons: string[];
    activePointLoads: string[];
    activeWaterLevels: string[];
    calculationType: 'FEA' | 'K0';
}

interface TestSequentialRequest {
    stages: any[];
    continue_from_previous: boolean;
}

// Test data untuk sequential analysis
export const testSequentialData: TestSequentialRequest = {
    stages: [
        {
            stage_id: 'initial',
            stage_name: 'Initial Stage',
            stage_sequence: 1,
            calculation_type: 'K0',
            is_initial_stage: true,
            nodes: [
                { id: 1, x: 0, y: 0 },
                { id: 2, x: 1, y: 0 },
                { id: 3, x: 0, y: 1 },
                { id: 4, x: 1, y: 1 }
            ],
            elements: [
                { id: 1, node1: 1, node2: 2, node3: 3 },
                { id: 2, node1: 2, node2: 4, node3: 3 }
            ],
            boundaryConditionsFullFixed: [
                { node: 1 },
                { node: 2 }
            ],
            boundaryConditionsNormalFixed: [
                { node: 3 },
                { node: 4 }
            ],
            loads: [],
            materials: [
                {
                    element_id: 1,
                    material: {
                        youngsModulus: 30000,
                        poissonsRatio: 0.3,
                        unitWeightSaturated: 20.0,
                        unitWeightUnsaturated: 18.0,
                        cohesion: 10,
                        frictionAngle: 30,
                        thickness: 1.0,
                        permeability: 1e-6,
                        voidRatio: 0.8,
                        specificGravity: 2.65
                    }
                },
                {
                    element_id: 2,
                    material: {
                        youngsModulus: 30000,
                        poissonsRatio: 0.3,
                        unitWeightSaturated: 20.0,
                        unitWeightUnsaturated: 18.0,
                        cohesion: 10,
                        frictionAngle: 30,
                        thickness: 1.0,
                        permeability: 1e-6,
                        voidRatio: 0.8,
                        specificGravity: 2.65
                    }
                }
            ],
            water_level: 0.5,
            water_level_points: [],
            interpolation_method: 'area_weighted',
            active_polygons: ['polygon_1'],
            active_point_loads: [],
            active_water_levels: []
        },
        {
            stage_id: 'construction',
            stage_name: 'Construction Stage',
            stage_sequence: 2,
            calculation_type: 'FEA',
            is_initial_stage: false,
            nodes: [
                { id: 1, x: 0, y: 0 },
                { id: 2, x: 1, y: 0 },
                { id: 3, x: 0, y: 1 },
                { id: 4, x: 1, y: 1 }
            ],
            elements: [
                { id: 1, node1: 1, node2: 2, node3: 3 },
                { id: 2, node1: 2, node2: 4, node3: 3 }
            ],
            boundaryConditionsFullFixed: [
                { node: 1 },
                { node: 2 }
            ],
            boundaryConditionsNormalFixed: [
                { node: 3 },
                { node: 4 }
            ],
            loads: [
                { node: 3, fx: 0, fy: -10 },
                { node: 4, fx: 0, fy: -10 }
            ],
            materials: [
                {
                    element_id: 1,
                    material: {
                        youngsModulus: 30000,
                        poissonsRatio: 0.3,
                        unitWeightSaturated: 20.0,
                        unitWeightUnsaturated: 18.0,
                        cohesion: 10,
                        frictionAngle: 30,
                        thickness: 1.0,
                        permeability: 1e-6,
                        voidRatio: 0.8,
                        specificGravity: 2.65
                    }
                },
                {
                    element_id: 2,
                    material: {
                        youngsModulus: 30000,
                        poissonsRatio: 0.3,
                        unitWeightSaturated: 20.0,
                        unitWeightUnsaturated: 18.0,
                        cohesion: 10,
                        frictionAngle: 30,
                        thickness: 1.0,
                        permeability: 1e-6,
                        voidRatio: 0.8,
                        specificGravity: 2.65
                    }
                }
            ],
            water_level: 0.5,
            water_level_points: [],
            interpolation_method: 'area_weighted',
            active_polygons: ['polygon_1'],
            active_point_loads: [],
            active_water_levels: []
        }
    ],
    continue_from_previous: true
};

// Function untuk test API call
export async function testSequentialAPI() {
    try {
        const API_URL = 'http://localhost:8000';
        console.log('🧪 Testing Sequential Analysis API...');
        
        const response = await fetch(`${API_URL}/api/sequential/analyze`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(testSequentialData)
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            console.log('✅ Sequential Analysis API test successful!');
            console.log('📊 Results:', result);
            return result;
        } else {
            throw new Error(`Sequential analysis failed: ${result.error || result.message}`);
        }
    } catch (error) {
        console.error('❌ Sequential Analysis API test failed:', error);
        throw error;
    }
}

// Function untuk test history API
export async function testHistoryAPI() {
    try {
        const API_URL = 'http://localhost:8000';
        console.log('🧪 Testing History API...');
        
        const response = await fetch(`${API_URL}/api/sequential/history`);
        
        if (!response.ok) {
            throw new Error(`History API request failed: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('✅ History API test successful!');
        console.log('📊 History:', result);
        return result;
    } catch (error) {
        console.error('❌ History API test failed:', error);
        throw error;
    }
}

// Function untuk clear history
export async function clearHistoryAPI() {
    try {
        const API_URL = 'http://localhost:8000';
        console.log('🧪 Testing Clear History API...');
        
        const response = await fetch(`${API_URL}/api/sequential/history`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error(`Clear history API request failed: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('✅ Clear History API test successful!');
        console.log('📊 Result:', result);
        return result;
    } catch (error) {
        console.error('❌ Clear History API test failed:', error);
        throw error;
    }
}

// Export untuk penggunaan di browser console
if (typeof window !== 'undefined') {
    (window as any).testSequentialAPI = testSequentialAPI;
    (window as any).testHistoryAPI = testHistoryAPI;
    (window as any).clearHistoryAPI = clearHistoryAPI;
    (window as any).testSequentialData = testSequentialData;
} 