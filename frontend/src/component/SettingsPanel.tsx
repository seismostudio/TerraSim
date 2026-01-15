import React, { useState } from 'react';
import { useAppContext } from '../App';

interface SettingsPanelProps {
    isVisible: boolean;
    onClose: () => void;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ isVisible, onClose }) => {
    const [activeTab, setActiveTab] = useState<'general' | 'analysis'>('general');
    
    // Get context values for settings
    const {
        interpolationMethod, setInterpolationMethod,
        // General settings
        theme, setTheme,
        snapToGrid, setSnapToGrid,
        gridSize, setGridSize,
        showGrid, setShowGrid,
        showAxis, setShowAxis,
        showAxisLabels, setShowAxisLabels
    } = useAppContext();

    if (!isVisible) return null;

    const handleTabClick = (tab: 'general' | 'analysis') => {
        setActiveTab(tab);
    };

    const handleThemeChange = (newTheme: 'light' | 'dark') => {
        setTheme(newTheme);
        // Apply theme to document
        document.documentElement.classList.remove('light', 'dark');
        document.documentElement.classList.add(newTheme);
    };

    const handleClose = () => {
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/20 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-[600px] max-h-[70vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800">Settings</h2>
                    <button
                        onClick={handleClose}
                        className="text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-gray-200">
                    <button
                        onClick={() => handleTabClick('general')}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${
                            activeTab === 'general'
                                ? 'text-blue-600 border-b-2 border-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        General
                    </button>
                    <button
                        onClick={() => handleTabClick('analysis')}
                        className={`px-4 py-2 text-sm font-medium transition-colors ${
                            activeTab === 'analysis'
                                ? 'text-blue-600 border-b-2 border-blue-600'
                                : 'text-gray-500 hover:text-gray-700'
                        }`}
                    >
                        Analysis
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {activeTab === 'general' && (
                        <div className="space-y-6">
                            {/* Theme Settings */}
                            <div>
                                <h3 className="text-sm font-medium text-gray-800 mb-3">Theme</h3>
                                <div className="space-y-2">
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            name="theme"
                                            checked={theme === 'light'}
                                            onChange={() => handleThemeChange('light')}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">Light Theme</span>
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            name="theme"
                                            checked={theme === 'dark'}
                                            onChange={() => handleThemeChange('dark')}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">Dark Theme</span>
                                    </label>
                                </div>
                            </div>

                            {/* Grid Settings */}
                            <div>
                                <h3 className="text-sm font-medium text-gray-800 mb-3">Grid Settings</h3>
                                <div className="space-y-3">
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={showGrid}
                                            onChange={(e) => setShowGrid(e.target.checked)}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">Show Grid</span>
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={snapToGrid}
                                            onChange={(e) => setSnapToGrid(e.target.checked)}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">Snap to Grid</span>
                                    </label>
                                    <div className="flex items-center space-x-2">
                                        <span className="text-sm">Grid Size:</span>
                                        <input
                                            type="number"
                                            value={gridSize}
                                            onChange={(e) => setGridSize(Number(e.target.value))}
                                            step="0.1"
                                            min="0.1"
                                            max="2.0"
                                            className="w-20 px-2 py-1 text-sm border border-gray-300 rounded"
                                        />
                                        <span className="text-sm text-gray-500">m</span>
                                    </div>
                                </div>
                            </div>

                            {/* View Settings */}
                            <div>
                                <h3 className="text-sm font-medium text-gray-800 mb-3">View Settings</h3>
                                <div className="space-y-2">
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={showAxis}
                                            onChange={(e) => setShowAxis(e.target.checked)}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">Show Coordinate Axes</span>
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={showAxisLabels}
                                            onChange={(e) => setShowAxisLabels(e.target.checked)}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">Show Axis Labels</span>
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'analysis' && (
                        <div className="space-y-6">
                            {/* Interpolation Method Selection */}
                            <div>
                                <h3 className="text-sm font-medium text-gray-800 mb-3">Interpolation Method</h3>
                                <div className="text-xs text-gray-500 mb-2">
                                    Interpolation from element results to nodal values:
                                </div>
                                <div className="space-y-2">
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            name="interpolationMethod"
                                            checked={interpolationMethod === "simple_average"}
                                            onChange={() => setInterpolationMethod("simple_average")}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">Simple Average</span>
                                    </label>
                                    <div className="text-xs text-gray-500 ml-6">
                                        Simple average of contributing elements (basic method). 
                                        <strong>Fastest speed, basic accuracy.</strong>
                                    </div>

                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            name="interpolationMethod"
                                            checked={interpolationMethod === "area_weighted"}
                                            onChange={() => setInterpolationMethod("area_weighted")}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">Area Weighted (Recommended)</span>
                                    </label>
                                    <div className="text-xs text-gray-500 ml-6">
                                        Weight by element area. More accurate for irregular meshes. 
                                        <strong>Best balance of speed and accuracy.</strong>
                                    </div>
                                    
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            name="interpolationMethod"
                                            checked={interpolationMethod === "distance_weighted"}
                                            onChange={() => setInterpolationMethod("distance_weighted")}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">Distance Weighted</span>
                                    </label>
                                    <div className="text-xs text-gray-500 ml-6">
                                        Weight by inverse distance from centroid to node. 
                                        <strong>Good accuracy, moderate speed.</strong>
                                    </div>
                                    
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            name="interpolationMethod"
                                            checked={interpolationMethod === "shape_function"}
                                            onChange={() => setInterpolationMethod("shape_function")}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">Shape Function (High Accuracy)</span>
                                    </label>
                                    <div className="text-xs text-gray-500 ml-6">
                                        Use CST shape functions for accurate interpolation. 
                                        <strong>High accuracy, moderate speed.</strong>
                                    </div>
                                    
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            name="interpolationMethod"
                                            checked={interpolationMethod === "gauss_quadrature"}
                                            onChange={() => setInterpolationMethod("gauss_quadrature")}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">Gauss Quadrature (Highest Accuracy)</span>
                                    </label>
                                    <div className="text-xs text-gray-500 ml-6">
                                        Use Gauss quadrature points for most accurate stress recovery. 
                                        <strong>Note: May be slower for large meshes.</strong>
                                    </div>
                                    
                                    <label className="flex items-center">
                                        <input
                                            type="radio"
                                            name="interpolationMethod"
                                            checked={interpolationMethod === "superconvergent"}
                                            onChange={() => setInterpolationMethod("superconvergent")}
                                            className="mr-2"
                                        />
                                        <span className="text-sm">Superconvergent Recovery (Best)</span>
                                    </label>
                                    <div className="text-xs text-gray-500 ml-6">
                                        Use superconvergent patch recovery for optimal accuracy. 
                                        <strong>Note: May be slower for large meshes.</strong>
                                    </div>
                                </div>
                            </div>


                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end space-x-2 p-4 border-t border-gray-200">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsPanel; 