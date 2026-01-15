import { useState } from "react";
import InputCanvas from "./input panel/InputCanvas";
import Toolbars from "./input panel/toolbars";
import ProjectBrowser from "./ProjectBrowser";
import MaterialPanel from "./MaterialPanel";
import AssignMaterialPanel from "./AssignMaterialPanel";
import { useAppContext } from "../App";
import { usePersistentState, usePersistentMaterialState } from "../hooks/usePersistentState";

export default function InputWizard() {
    const { elementMaterials } = useAppContext();
    const [isPolygonMode, setIsPolygonMode] = useState(false);
    const [isRectangleMode, setIsRectangleMode] = useState(false);
    const [isSelectMode, setIsSelectMode] = useState(true);

    const [isPointLoadMode, setIsPointLoadMode] = useState(false);
    const [isWaterLevelMode, setIsWaterLevelMode] = useState(false);
    const [showMaterialViz, setShowMaterialViz] = useState(false);
    const [showMesh, setShowMesh] = useState(false);
    const [isGeneratingMesh, setIsGeneratingMesh] = useState(false);
    const [meshGenerationStatus, setMeshGenerationStatus] = useState('');
    const [showGeometryMode, setShowGeometryMode] = usePersistentState('showGeometryMode', false);
    const [showMaterialsMode, setShowMaterialsMode] = usePersistentState('showMaterialsMode', false);
    const [showLoadsMode, setShowLoadsMode] = usePersistentState('showLoadsMode', false);
    const handleTogglePolygonMode = () => {
        setIsPolygonMode(!isPolygonMode);
        setIsRectangleMode(false); // Turn off rectangle mode when polygon mode is toggled
        setIsSelectMode(false); // Turn off select mode when polygon mode is toggled
        // Keep geometry mode active when using polygon mode
    };

    const handleToggleRectangleMode = () => {
        setIsRectangleMode(!isRectangleMode);
        setIsPolygonMode(false); // Turn off polygon mode when rectangle mode is toggled
        setIsSelectMode(false); // Turn off select mode when rectangle mode is toggled
        // Keep geometry mode active when using rectangle mode
    };

    const handleToggleSelectMode = () => {
        setIsSelectMode(!isSelectMode);
        setIsPolygonMode(false); // Turn off polygon mode when select mode is toggled
        setIsRectangleMode(false); // Turn off rectangle mode when select mode is toggled
        // Keep geometry mode active when using select mode
    };

    const handleToggleGeometryMode = () => {
        setShowGeometryMode(!showGeometryMode);
        setShowMaterialsMode(false); // Turn off materials mode when geometry mode is toggled
        // Turn off all drawing modes when toggling geometry mode
        setIsPolygonMode(false);
        setIsRectangleMode(false);
        setIsSelectMode(false);
        setShowLoadsMode(false);
    };

    const handleToggleMaterialsMode = () => {
        setShowMaterialsMode(!showMaterialsMode);
        setShowGeometryMode(false); // Turn off geometry mode when materials mode is toggled
        // Turn off all drawing modes when toggling materials mode
        setIsPolygonMode(false);
        setIsRectangleMode(false);
        setIsSelectMode(false);
        setShowLoadsMode(false);
    };

    const handleCloseMaterialPanel = () => {
        setShowMaterialPanel(false);
        setEditingMaterial(null);
    };

    const handleCloseAssignMaterialPanel = () => {
        setShowAssignMaterialPanel(false);
    };

    const [showMaterialPanel, setShowMaterialPanel] = usePersistentState('showMaterialPanel', false);
    const [editingMaterial, setEditingMaterial] = usePersistentMaterialState('editingMaterial', null);
    const [showAssignMaterialPanel, setShowAssignMaterialPanel] = usePersistentState('showAssignMaterialPanel', false);

    const handleAddMaterial = () => {
        // This will open the MaterialPanel for adding new material
        setEditingMaterial(null);
        setShowMaterialPanel(true);
    };

    const handleEditMaterial = (material: any) => {
        // This will open the MaterialPanel for editing existing material
        setEditingMaterial(material);
        setShowMaterialPanel(true);
    };

    const handleAssignMaterial = () => {
        setShowAssignMaterialPanel(true);
    };

    const handleToggleLoadsMode = () => {
        setShowLoadsMode(!showLoadsMode);
        setShowGeometryMode(false);
        setShowMaterialsMode(false);
        setIsPolygonMode(false);
        setIsRectangleMode(false);
        setIsSelectMode(false);
        setIsPointLoadMode(false);
    };

    const handleTogglePointLoadMode = () => {
        setIsPointLoadMode(!isPointLoadMode);
        setIsPolygonMode(false);
        setIsRectangleMode(false);
        setIsSelectMode(false);
        setIsWaterLevelMode(false);
    };

    const handleToggleWaterLevelMode = () => {
        setIsWaterLevelMode(!isWaterLevelMode);
        setIsPolygonMode(false);
        setIsRectangleMode(false);
        setIsSelectMode(false);
        setIsPointLoadMode(false);
    };

    const handleToggleMaterialViz = () => {
        setShowMaterialViz(!showMaterialViz);
    };

    const handleResetView = () => {
        // This will be handled by InputCanvas
    };

    const handleFitToView = () => {
        // This will be handled by InputCanvas
    };

    const handleGenerateMesh = () => {
        // This will be handled by InputCanvas
    };

    const handleOpenMeshWizard = () => {
        // This will be handled by InputCanvas
    };



    return (
        <>
        <div className="flex flex-row h-full overflow-y-auto w-full">
                {/* Project Browser Panel */}
                <ProjectBrowser onEditMaterial={handleEditMaterial} />
                
                <div className="flex-1 w-4/5 h-full">
                    <Toolbars
                        onTogglePolygonMode={handleTogglePolygonMode}
                        onToggleRectangleMode={handleToggleRectangleMode}
                        onToggleSelectMode={handleToggleSelectMode}
                        onToggleLoadsMode={handleToggleLoadsMode}
                        onTogglePointLoadMode={handleTogglePointLoadMode}
                        onToggleWaterLevelMode={handleToggleWaterLevelMode}
                        onToggleMaterialViz={handleToggleMaterialViz}
                        onResetView={handleResetView}
                        onFitToView={handleFitToView}
                        onGenerateMesh={handleGenerateMesh}
                        onOpenMeshWizard={handleOpenMeshWizard}
                        isPolygonMode={isPolygonMode}
                        isRectangleMode={isRectangleMode}
                        isSelectMode={isSelectMode}
                        isPointLoadMode={isPointLoadMode}
                        isWaterLevelMode={isWaterLevelMode}
                        showMaterialViz={showMaterialViz}
                        showMesh={showMesh}
                        isGeneratingMesh={isGeneratingMesh}
                        meshGenerationStatus={meshGenerationStatus}
                        showGeometryMode={showGeometryMode}
                        onToggleGeometryMode={handleToggleGeometryMode}
                        showMaterialsMode={showMaterialsMode}
                        onToggleMaterialsMode={handleToggleMaterialsMode}
                        onAddMaterial={handleAddMaterial}
                        onAssignMaterial={handleAssignMaterial}
                        showLoadsMode={showLoadsMode}
                    />
                    <InputCanvas 
                        externalPolygonMode={isPolygonMode}
                        externalRectangleMode={isRectangleMode}
                        externalSelectMode={isSelectMode}
                        externalPointLoadMode={isPointLoadMode}
                        externalWaterLevelMode={isWaterLevelMode}
                        showMaterialViz={showMaterialViz}
                    />
            </div>
        </div>
            
        {/* Material Panel */}
        <MaterialPanel 
            isVisible={showMaterialPanel}
            onClose={handleCloseMaterialPanel}
            editingMaterial={editingMaterial}
        />
        
        {/* Assign Material Panel */}
        <AssignMaterialPanel 
            isVisible={showAssignMaterialPanel}
            onClose={handleCloseAssignMaterialPanel}
        />
        </>
    )
}