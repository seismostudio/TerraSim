import { ArrowDownIcon, ArrowDownToDotIcon, ArrowDownToLineIcon, ArrowUpDownIcon, BlocksIcon, DropletsIcon, FolderIcon, MousePointer2Icon, PlusIcon, Rows4Icon, SquareIcon } from "lucide-react";

interface ToolbarsProps {
    onTogglePolygonMode?: () => void;
    onToggleRectangleMode?: () => void;
    onToggleSelectMode?: () => void;
    onToggleLoadsMode?: () => void;
    onTogglePointLoadMode?: () => void;
    onToggleWaterLevelMode?: () => void;
    onToggleMaterialViz?: () => void;
    onResetView?: () => void;
    onFitToView?: () => void;
    onGenerateMesh?: () => void;
    onOpenMeshWizard?: () => void;
    isPolygonMode?: boolean;
    isRectangleMode?: boolean;
    isSelectMode?: boolean;
    isPointLoadMode?: boolean;
    isWaterLevelMode?: boolean;
    showMaterialViz?: boolean;
    showMesh?: boolean;
    isGeneratingMesh?: boolean;
    meshGenerationStatus?: string;
    showGeometryMode?: boolean;
    onToggleGeometryMode?: () => void;
    showMaterialsMode?: boolean;
    onToggleMaterialsMode?: () => void;
    onAddMaterial?: () => void;
    onAssignMaterial?: () => void;
    showLoadsMode?: boolean;
}

export default function Toolbars({ 
    isPolygonMode = false, 
    onTogglePolygonMode, 
    isRectangleMode = false, 
    onToggleRectangleMode,
    isSelectMode = false,
    onToggleSelectMode,
    showGeometryMode = false,
    onToggleGeometryMode,
    showMaterialsMode = false,
    onToggleMaterialsMode,
    onAddMaterial,
    onAssignMaterial,
    showLoadsMode = false,
    onToggleLoadsMode,
    isPointLoadMode,
    onTogglePointLoadMode,
    isWaterLevelMode = false,
    onToggleWaterLevelMode
}: ToolbarsProps) {
    return (
        <div className="flex flex-row w-full p-2 border-b border-gray-200">
            <div className="flex flex-row gap-2 border-r border-gray-400">
                <button 
                    className={`px-3 py-2 rounded-md border ${showGeometryMode ? 'border-gray-500 bg-gray-300' : 'border-gray-400'}`}
                    title="Add Geometry"
                    onClick={onToggleGeometryMode}
                >
                    <BlocksIcon className="w-4 h-4" />
                </button>
                <button 
                    className={`px-3 py-2 rounded-md border ${showMaterialsMode ? 'border-gray-500 bg-gray-300' : 'border-gray-400'}`}
                    title="Materials"
                    onClick={onToggleMaterialsMode}
                >
                    <Rows4Icon className="w-4 h-4" />
                </button>
                <button 
                    className={`px-3 py-2 rounded-md border ${showLoadsMode ? 'border-gray-500 bg-gray-300' : 'border-gray-400'}`}
                    title="Loads"
                    onClick={onToggleLoadsMode}
                >
                    <ArrowDownIcon className="w-4 h-4" />
                </button>
                <button 
                    className={`px-3 py-2 mr-2 rounded-md border ${isWaterLevelMode ? 'border-gray-500 bg-gray-300' : 'border-gray-400'}`}
                    title="Water Level"
                    onClick={onToggleWaterLevelMode}
                >
                    <DropletsIcon className="w-4 h-4" />
                </button>
            </div>
            <div className="flex flex-row gap-2">
                <button
                    className={`px-3 py-2 ml-2 rounded-md border ${isSelectMode ? 'border-gray-500 bg-gray-300' : 'border-gray-400'}`}
                    title="Select"
                    onClick={onToggleSelectMode}
                >
                    <MousePointer2Icon className="w-4 h-4" />
                </button>

                {/* Geometry Mode - Only show when Add Geometry is active */}
                {showGeometryMode && (
                    <>
                <button
                            className={`px-3 py-2 rounded-md border ${isPolygonMode ? 'border-gray-500 bg-gray-300' : 'border-gray-400'}`}
                    title="Create Polygon"
                            onClick={onTogglePolygonMode}
                >
                    <FolderIcon className="w-4 h-4" />
                </button>
                        <button
                            className={`px-3 py-2 rounded-md border ${isRectangleMode ? 'border-gray-500 bg-gray-300' : 'border-gray-400'}`}
                            title="Create Rectangle"
                            onClick={onToggleRectangleMode}
                        >
                            <SquareIcon className="w-4 h-4" />
                        </button>
                    </>
                )}

                {/* Materials Mode - Only show when Materials is active */}
                {showMaterialsMode && (
                    <>
                        <button
                            className="px-3 py-2 rounded-md border border-gray-400 hover:bg-gray-100"
                            title="Add Material"
                            onClick={onAddMaterial}
                        >
                            <PlusIcon className="w-4 h-4" />
                        </button>
                        <button
                            className="px-3 py-2 rounded-md border border-gray-400 hover:bg-gray-100"
                            title="Assign Material"
                            onClick={onAssignMaterial}
                        >
                            <ArrowUpDownIcon className="w-4 h-4" />
                        </button>
                    </>
                )}

                {/* Loads Mode - Only show when Loads is active */}
                {showLoadsMode && (
                    <>
                        <button
                            className={`px-3 py-2 rounded-md border ${isPointLoadMode ? 'bg-blue-500 text-white border-blue-500' : 'border-gray-400 hover:bg-gray-100'}`}
                            title="Add Point Load"
                            onClick={onTogglePointLoadMode}
                        >
                            <ArrowDownToDotIcon className="w-4 h-4" />
                        </button>
                        <button
                            className="px-3 py-2 rounded-md border border-gray-400 hover:bg-gray-100"
                            title="Add Line Load"
                            onClick={onToggleLoadsMode}
                        >
                            <ArrowDownToLineIcon className="w-4 h-4" />
                        </button>
                    </>
                )}


            </div>
        </div>
    );
}