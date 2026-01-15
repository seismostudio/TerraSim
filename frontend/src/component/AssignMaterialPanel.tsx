import React, { useState } from 'react';
import { useAppContext } from '../App';

interface AssignMaterialPanelProps {
    isVisible: boolean;
    onClose: () => void;
}

export default function AssignMaterialPanel({ isVisible, onClose }: AssignMaterialPanelProps) {
    const { 
        polygons, 
        materialList, 
        assignMaterialToPolygon 
    } = useAppContext();

    const [selectedPolygonId, setSelectedPolygonId] = useState<string>('');
    const [selectedMaterialId, setSelectedMaterialId] = useState<string>('');

    const handleAssign = () => {
        if (!selectedPolygonId || !selectedMaterialId) {
            alert('Please select both a polygon and a material');
            return;
        }

        assignMaterialToPolygon(selectedPolygonId, selectedMaterialId);
        alert(`Material assigned successfully to polygon!`);
        
        // Reset selections
        setSelectedPolygonId('');
        setSelectedMaterialId('');
        
        // Close panel
        onClose();
    };

    const handleCancel = () => {
        setSelectedPolygonId('');
        setSelectedMaterialId('');
        onClose();
    };

    const getMaterialColor = (materialId: string) => {
        const material = materialList.find(m => m.id === materialId);
        return material ? material.color : '#666';
    };

    const getPolygonName = (polygonId: string) => {
        const polygon = polygons.find(p => p.id === polygonId);
        if (!polygon) return 'Unknown Polygon';
        
        // Try to get a meaningful name
        if (polygonId.includes('rectangle')) return 'Rectangle';
        if (polygonId.includes('polygon')) return 'Polygon';
        if (polygonId.includes('top_rectangle')) return 'Top Rectangle';
        if (polygonId.includes('bottom_rectangle')) return 'Bottom Rectangle';
        if (polygonId.includes('top_slope')) return 'Top Slope';
        
        return 'Polygon';
    };

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 bg-black/20 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-96 max-h-[80vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-semibold text-gray-800">
                        Assign Material to Geometry
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                    >
                        ×
                    </button>
                </div>

                {/* Polygon Selection */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Geometry:
                    </label>
                    <select
                        value={selectedPolygonId}
                        onChange={(e) => setSelectedPolygonId(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">Choose a polygon...</option>
                        {polygons.map((polygon) => (
                            <option key={polygon.id} value={polygon.id}>
                                {getPolygonName(polygon.id || '')} 
                                {polygon.materialId ? ' (Has Material)' : ' (No Material)'}
                            </option>
                        ))}
                    </select>
                    
                    {polygons.length === 0 && (
                        <p className="text-sm text-red-500 mt-1">
                            No polygons available. Please create a polygon first.
                        </p>
                    )}
                </div>

                {/* Material Selection */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        Select Material:
                    </label>
                    <select
                        value={selectedMaterialId}
                        onChange={(e) => setSelectedMaterialId(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">Choose a material...</option>
                        {materialList.map((material) => (
                            <option key={material.id} value={material.id}>
                                {material.name}
                            </option>
                        ))}
                    </select>
                    
                    {materialList.length === 0 && (
                        <p className="text-sm text-red-500 mt-1">
                            No materials available. Please create a material first.
                        </p>
                    )}
                </div>

                {/* Material Preview */}
                {selectedMaterialId && (
                    <div className="mb-6 p-3 bg-gray-50 rounded-md">
                        <h3 className="text-sm font-medium text-gray-700 mb-2">Selected Material:</h3>
                        {(() => {
                            const material = materialList.find(m => m.id === selectedMaterialId);
                            if (!material) return null;
                            
                            return (
                                <div className="flex items-center space-x-3">
                                    <div 
                                        className="w-6 h-6 rounded border border-gray-300" 
                                        style={{ backgroundColor: material.color }}
                                    ></div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-800">{material.name}</p>
                                        <p className="text-xs text-gray-500">
                                            E: {material.youngsModulus.toLocaleString()} kPa, 
                                            ν: {material.poissonsRatio}, 
                                            γsat: {material.unitWeightSaturated} kN/m³ | γunsat: {material.unitWeightUnsaturated} kN/m³
                                        </p>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Polygon Preview */}
                {selectedPolygonId && (
                    <div className="mb-6 p-3 bg-gray-50 rounded-md">
                        <h3 className="text-sm font-medium text-gray-700 mb-2">Selected Geometry:</h3>
                        {(() => {
                            const polygon = polygons.find(p => p.id === selectedPolygonId);
                            if (!polygon) return null;
                            
                            return (
                                <div>
                                    <p className="text-sm text-gray-800">{getPolygonName(polygon.id || '')}</p>
                                    <p className="text-xs text-gray-500">
                                        Vertices: {polygon.vertices.length - 1} 
                                        {polygon.materialId && (
                                            <span className="text-green-600 ml-2">
                                                ✓ Has material assigned
                                            </span>
                                        )}
                                    </p>
                                </div>
                            );
                        })()}
                    </div>
                )}

                {/* Action Buttons */}
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={handleCancel}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleAssign}
                        disabled={!selectedPolygonId || !selectedMaterialId}
                        className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            selectedPolygonId && selectedMaterialId
                                ? 'bg-blue-600 hover:bg-blue-700'
                                : 'bg-gray-400 cursor-not-allowed'
                        }`}
                    >
                        Assign Material
                    </button>
                </div>
            </div>
        </div>
    );
} 