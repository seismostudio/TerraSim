import React, { useState } from 'react';
import { useAppContext } from '../App';
import { initialMaterialList } from '../testdata';

interface Material {
    id?: string;
    name: string;
    color: string;
    youngsModulus: number;
    poissonsRatio: number;
    unitWeightSaturated: number;  // ✅ Gamma saturated
    unitWeightUnsaturated: number;  // ✅ Gamma unsaturated
    cohesion: number;
    frictionAngle: number;
    dilationAngle: number;  // ✅ Dilation angle (ψ) for plastic flow
    thickness: number;
    permeability: number;
    voidRatio: number;
    specificGravity: number;
}

interface MaterialPanelProps {
    isVisible: boolean;
    onClose: () => void;
    editingMaterial?: Material | null;
}

type TabType = 'material' | 'engineering' | 'consolidation';

const MaterialPanel: React.FC<MaterialPanelProps> = ({ isVisible, onClose, editingMaterial }) => {
    const { addMaterial, updateMaterial } = useAppContext();
    const [isEditMode, setIsEditMode] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('material');
    const [newMaterial, setNewMaterial] = useState<Material>({
        name: 'Material 1',
        color: initialMaterialList[0]?.color || '#8B4513',
        youngsModulus: initialMaterialList[0]?.youngsModulus || 0,
        poissonsRatio: initialMaterialList[0]?.poissonsRatio || 0,
        unitWeightSaturated: initialMaterialList[0]?.unitWeightSaturated || 0,
        unitWeightUnsaturated: initialMaterialList[0]?.unitWeightUnsaturated || 0,
        cohesion: initialMaterialList[0]?.cohesion || 0,
        frictionAngle: initialMaterialList[0]?.frictionAngle || 0,
        dilationAngle: initialMaterialList[0]?.dilationAngle || 0,
        thickness: initialMaterialList[0]?.thickness || 0,
        permeability: initialMaterialList[0]?.permeability || 0,
        voidRatio: initialMaterialList[0]?.voidRatio || 0,
        specificGravity: initialMaterialList[0]?.specificGravity || 0
    });

    // Update form when editing material changes
    React.useEffect(() => {
        if (editingMaterial) {
            setIsEditMode(true);
            setNewMaterial(editingMaterial);
        } else {
            setIsEditMode(false);
            setNewMaterial({
                name: 'Material 1',
                color: initialMaterialList[0]?.color || '#8B4513',
                youngsModulus: initialMaterialList[0]?.youngsModulus || 0,
                poissonsRatio: initialMaterialList[0]?.poissonsRatio || 0,
                unitWeightSaturated: initialMaterialList[0]?.unitWeightSaturated || 0,
                unitWeightUnsaturated: initialMaterialList[0]?.unitWeightUnsaturated || 0,
                cohesion: initialMaterialList[0]?.cohesion || 0,
                frictionAngle: initialMaterialList[0]?.frictionAngle || 0,
                dilationAngle: initialMaterialList[0]?.dilationAngle || 0,
                thickness: initialMaterialList[0]?.thickness || 0,
                permeability: initialMaterialList[0]?.permeability || 0,
                voidRatio: initialMaterialList[0]?.voidRatio || 0,
                specificGravity: initialMaterialList[0]?.specificGravity || 0
            });
        }
    }, [editingMaterial]);

    const handleInputChange = (field: keyof Material, value: string | number) => {
        setNewMaterial(prev => ({
            ...prev,
            [field]: value
        }));
    };

    const handleAddMaterial = () => {
        // Validate all required fields
        if (newMaterial.name.trim() === '') {
            alert('Please enter a material name');
            return;
        }
        
        // Validate numeric values
        const numericFields = ['youngsModulus', 'poissonsRatio', 'unitWeightSaturated', 'unitWeightUnsaturated', 'cohesion', 'frictionAngle', 'dilationAngle', 'thickness', 'permeability', 'voidRatio', 'specificGravity'];
        const invalidNumericFields = numericFields.filter(field => {
            const value = newMaterial[field as keyof Material];
            return typeof value !== 'number' || isNaN(value) || value <= 0;
        });


        // ✅ Validate dilation angle bounds
        if (newMaterial.dilationAngle < 0) {
            alert('Dilation angle (ψ) cannot be negative. Please enter a value ≥ 0°');
            return;
        }
        
        if (newMaterial.dilationAngle > newMaterial.frictionAngle) {
            alert(`Dilation angle (ψ = ${newMaterial.dilationAngle}°) cannot be greater than friction angle (φ = ${newMaterial.frictionAngle}°). Please enter ψ ≤ φ`);
            return;
        }
        
        if (newMaterial.dilationAngle > 45) {
            alert(`Dilation angle (ψ = ${newMaterial.dilationAngle}°) is unusually high. Typical values are 0° ≤ ψ ≤ φ. Consider using a lower value.`);
            // Don't return - just warn user
        }

        if (isEditMode && editingMaterial?.id) {
            // Update existing material
            updateMaterial(editingMaterial.id, newMaterial);
        } else {
            // Add new material
            const materialWithId = {
                ...newMaterial,
                id: `material_${Date.now()}`
            };
            addMaterial(materialWithId);
        }

        // Reset form
        setNewMaterial({
            name: 'Material 1',
            color: initialMaterialList[0]?.color || '#8B4513',
            youngsModulus: initialMaterialList[0]?.youngsModulus || 0,
            poissonsRatio: initialMaterialList[0]?.poissonsRatio || 0,
            unitWeightSaturated: initialMaterialList[0]?.unitWeightSaturated || 0,
            unitWeightUnsaturated: initialMaterialList[0]?.unitWeightUnsaturated || 0,
            cohesion: initialMaterialList[0]?.cohesion || 0,
            frictionAngle: initialMaterialList[0]?.frictionAngle || 0,
            dilationAngle: initialMaterialList[0]?.dilationAngle || 0,
            thickness: initialMaterialList[0]?.thickness || 0,
            permeability: initialMaterialList[0]?.permeability || 0,
            voidRatio: initialMaterialList[0]?.voidRatio || 0,
            specificGravity: initialMaterialList[0]?.specificGravity || 0
        });
        setIsEditMode(false);
        onClose();
    };

    const renderTabButton = (tab: TabType, label: string) => (
        <button
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab
                    ? 'bg-white text-gray-600 border-b-2 border-gray-600'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
        >
            {label}
        </button>
    );

    const renderMaterialPropertiesTab = () => (
        <div className="space-y-4">
            {/* Material Name */}
            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">
                    Material Name:
                </label>
                <input
                    type="text"
                    value={newMaterial.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter material name"
                />
            </div>

            {/* Color Input */}
            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">
                    Material Color:
                </label>
                <div className="flex items-center gap-3">
                    <input
                        type="color"
                        value={newMaterial.color}
                        onChange={(e) => handleInputChange('color', e.target.value)}
                        className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                        type="text"
                        value={newMaterial.color}
                        onChange={(e) => handleInputChange('color', e.target.value)}
                        className="flex-1 p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="#8B4513"
                    />
                </div>
            </div>

            {/* Material Model */}
            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">
                    Material Model:
                </label>
                <select

                    className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="elastic">Linear Elastic</option>
                    <option value="plastic">Mohr-Coulomb</option>
                </select>
            </div>

            {/* Drainage Type */}
            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">
                    Drainage Type:
                </label>
                <select

                    className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="free">Drained</option>
                    <option value="fixed">Undrained A</option>
                    <option value="fixed">Undrained B</option>
                    <option value="fixed">Undrained C</option>
                    <option value="fixed">Non-Porous</option>
                </select>
            </div>

            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">
                    Thickness (m):
                </label>
                <input
                    type="number"
                    value={newMaterial.thickness}
                    onChange={(e) => handleInputChange('thickness', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="1"
                />
            </div>
            
        </div>
    );

    const renderEngineeringPropertiesTab = () => (
        <div className="space-y-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Column 1 */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 border-b border-gray-200 pb-2">
                    <label className="text-sm font-medium text-gray-700">
                        Basic Parameters
                    </label>
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">
                        Unit Weight Saturated, γsat (kN/m³)
                    </label>
                    <input
                        type="number"
                        value={newMaterial.unitWeightSaturated}
                        onChange={(e) => handleInputChange('unitWeightSaturated', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="20"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">
                        Unit Weight Unsaturated, γunsat (kN/m³)
                    </label>
                    <input
                        type="number"
                        value={newMaterial.unitWeightUnsaturated}
                        onChange={(e) => handleInputChange('unitWeightUnsaturated', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="18"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">
                        Void Ratio, e
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        value={newMaterial.voidRatio}
                        onChange={(e) => handleInputChange('voidRatio', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.6"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">
                        Specific Gravity, Gs
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        value={newMaterial.specificGravity}
                        onChange={(e) => handleInputChange('specificGravity', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="2.65"
                    />
                </div>
            </div>

            {/* Column 2 */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 border-b border-gray-200 pb-2">
                    <label className="text-sm font-medium text-gray-700">
                        Strength Parameters
                    </label>
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">
                        Cohesion, c' (kN/m²)
                    </label>
                    <input
                        type="number"
                        value={newMaterial.cohesion}
                        onChange={(e) => handleInputChange('cohesion', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="10"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">
                        Friction Angle, φ' (°)
                    </label>
                    <input
                        type="number"
                        value={newMaterial.frictionAngle}
                        onChange={(e) => handleInputChange('frictionAngle', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="30"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">
                        Dilation Angle, ψ' (°)
                    </label>
                    <input
                        type="number"
                        value={newMaterial.dilationAngle}
                        onChange={(e) => handleInputChange('dilationAngle', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="15"
                    />
                </div>

            </div>

            {/* Column 3 */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 border-b border-gray-200 pb-2">
                    <label className="text-sm font-medium text-gray-700">
                        Stiffness Parameters
                    </label>
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">
                        Young's Modulus, E' (kN/m²)
                    </label>
                    <input
                        type="number"
                        value={newMaterial.youngsModulus}
                        onChange={(e) => handleInputChange('youngsModulus', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="30000"
                    />
                </div>
                <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-gray-700">
                        Poisson's Ratio, ν'
                    </label>
                    <input
                        type="number"
                        step="0.01"
                        value={newMaterial.poissonsRatio}
                        onChange={(e) => handleInputChange('poissonsRatio', parseFloat(e.target.value) || 0)}
                        className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.3"
                    />
                </div>
            </div>
        </div>
    );

    const renderConsolidationPropertiesTab = () => (
        <div className="space-y-4">
            <div className="flex flex-col gap-2">
                <label className="text-sm font-medium text-gray-700">
                    Permeability (m/s):
                </label>
                <input
                    type="number"
                    step="0.000001"
                    value={newMaterial.permeability}
                    onChange={(e) => handleInputChange('permeability', parseFloat(e.target.value) || 0)}
                    className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0.000001"
                />
                <p className="text-xs text-gray-500">
                    Typical values: 10⁻⁶ to 10⁻¹⁰ m/s for soils
                </p>
            </div>
        </div>
    );

    if (!isVisible) return null;

    return (
        <div className="fixed inset-0 bg-black/20 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-2xl w-11/12 max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex justify-between items-center p-6 bg-gray-50 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-800 m-0">
                        {isEditMode ? 'Edit Material' : 'Add New Material'}
                    </h3>
                    <button
                        onClick={onClose}
                        className="bg-transparent border-none text-2xl cursor-pointer text-gray-500 p-0 w-8 h-8 flex items-center justify-center rounded transition-colors hover:bg-gray-200 hover:text-gray-700"
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">
                    {/* Tab Navigation */}
                    <div className="flex border-b border-gray-200 bg-gray-50">
                        {renderTabButton('material', 'Material Properties')}
                        {renderTabButton('engineering', 'Engineering Properties')}
                        {renderTabButton('consolidation', 'Consolidation Properties')}
                    </div>

                    {/* Tab Content */}
                    <div className="p-6">
                        {/* Add Material Section */}
                        <div className="mb-8">

                            <form className="flex flex-col gap-4">
                                {/* Tab-specific content */}
                                {activeTab === 'material' && renderMaterialPropertiesTab()}
                                {activeTab === 'engineering' && renderEngineeringPropertiesTab()}
                                {activeTab === 'consolidation' && renderConsolidationPropertiesTab()}

                                {/* Action Buttons */}
                                <div className="flex gap-3 pt-4">
                                    <button
                                        type="button"
                                        onClick={handleAddMaterial}
                                        className="px-6 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500"
                                    >
                                        {isEditMode ? 'Update Material' : 'Add Material'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MaterialPanel; 