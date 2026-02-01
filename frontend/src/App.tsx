import { useState } from 'react';
import './App.css';
import { InputCanvas } from './component/InputCanvas';
import { OutputCanvas } from './component/OutputCanvas';
import { WizardHeader, WizardTab } from './component/WizardHeader';
import { InputSidebar } from './component/InputSidebar';
import { MeshSidebar } from './component/MeshSidebar';
import { StagingSidebar } from './component/StagingSidebar';
import { ResultSidebar } from './component/ResultSidebar';
import { SAMPLE_MESH_REQUEST, SAMPLE_PHASES, SAMPLE_MATERIALS, SAMPLE_SOLVER_SETTINGS, SAMPLE_GENERAL_SETTINGS, SAMPLE_MESH_SETTINGS } from './sample_data';
import { api } from './api';
import { MeshResponse, SolverResponse, PhaseRequest, Material, PolygonData, PointLoad, LineLoad, GeneralSettings, SolverSettings, MeshSettings, StepPoint, ProjectFile, ProjectMetadata } from './types';
import { MaterialModal } from './component/MaterialModal';
import { SettingsModal } from './component/SettingsModal';
import { CloudLoadModal } from './component/CloudLoadModal';
import { AuthProvider, useAuth } from './context/AuthContext';
import { pb } from './pb';
import { AuthModal } from './component/AuthModal';
import { parseDXF } from './utils/dxfImport';

function MainApp() {
    const { isValid, incrementRunningCount, user } = useAuth();
    // 0. Project State
    const [projectName, setProjectName] = useState("New Project");
    const [projectMetadata, setProjectMetadata] = useState<ProjectMetadata | null>(null);
    const [cloudProjectId, setCloudProjectId] = useState<string | null>(null);
    const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
    const [isCloudSaving, setIsCloudSaving] = useState(false);

    // 1. Wizard State
    const [activeTab, setActiveTab] = useState<WizardTab>(WizardTab.INPUT);
    const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

    // 2. Data State
    const [materials, setMaterials] = useState<Material[]>(SAMPLE_MATERIALS);
    const [polygons, setPolygons] = useState<PolygonData[]>(SAMPLE_MESH_REQUEST.polygons);
    const [pointLoads, setPointLoads] = useState<PointLoad[]>(SAMPLE_MESH_REQUEST.pointLoads);
    const [lineLoads, setLineLoads] = useState<LineLoad[]>([]);
    const [waterLevel, setWaterLevel] = useState<{ x: number, y: number }[]>(SAMPLE_MESH_REQUEST.water_level || []);
    const [phases, setPhases] = useState<PhaseRequest[]>(SAMPLE_PHASES);
    const [generalSettings, setGeneralSettings] = useState<GeneralSettings>(SAMPLE_GENERAL_SETTINGS);
    const [solverSettings, setSolverSettings] = useState<SolverSettings>(SAMPLE_SOLVER_SETTINGS);
    const [meshSettings, setMeshSettings] = useState<MeshSettings>(SAMPLE_MESH_SETTINGS);

    // 3. Execution State
    const [meshResponse, setMeshResponse] = useState<MeshResponse | null>(null);
    const [solverResponse, setSolverResponse] = useState<SolverResponse | null>(null);
    const [isGeneratingMesh, setIsGeneratingMesh] = useState(false);
    const [isRunningAnalysis, setIsRunningAnalysis] = useState(false);
    const [abortController, setAbortController] = useState<AbortController | null>(null);
    const [currentPhaseIdx, setCurrentPhaseIdx] = useState(0);
    const [liveStepPoints, setLiveStepPoints] = useState<StepPoint[]>([]);
    const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
    const [drawMode, setDrawMode] = useState<string | null>(null);
    const [selectedEntity, setSelectedEntity] = useState<{ type: string, id: string | number } | null>(null);

    // 4. Handlers
    const handleImportDXF = async (file: File) => {
        try {
            const importedPolygons = await parseDXF(file);
            if (importedPolygons.length > 0) {
                const materialId = materials[0]?.id || 'default';
                const polygonsWithMaterial = importedPolygons.map(p => ({
                    ...p,
                    materialId
                }));
                setPolygons([...polygons, ...polygonsWithMaterial]);
                alert(`Successfully imported ${importedPolygons.length} polygons.`);
            } else {
                alert("No closed polygons or regions found in DXF.");
            }
        } catch (error) {
            console.error("Import failed:", error);
            alert("Failed to import DXF file. See console for details.");
        }
    };

    const handleSaveMaterial = (mat: Material) => {
        setMaterials(materials.map(m => m.id === mat.id ? mat : m));
        setEditingMaterial(null);
    };

    const handleGenerateMesh = async () => {
        setIsGeneratingMesh(true);
        try {
            const result = await api.generateMesh({
                polygons,
                materials,
                pointLoads,
                lineLoads,
                water_level: waterLevel,
                mesh_settings: meshSettings
            });
            setMeshResponse(result);
            if (result.success) {
                setActiveTab(WizardTab.MESH);
            } else {
                alert(`Mesh generation failed: ${result.error}`);
            }
        } catch (error) {
            console.error(error);
            alert("Failed to generate mesh.");
        } finally {
            setIsGeneratingMesh(false);
        }
    };

    const handleRunAnalysis = async () => {
        if (!meshResponse || !meshResponse.success) {
            alert("Please generate mesh first!");
            setActiveTab(WizardTab.MESH);
            return;
        }

        setIsRunningAnalysis(true);
        incrementRunningCount();

        const controller = new AbortController();
        setAbortController(controller);

        try {
            const response = await api.solve({
                mesh: meshResponse,
                settings: solverSettings as any,
                phases: phases,
                water_level: waterLevel,
                point_loads: pointLoads,
                line_loads: lineLoads
            }, controller.signal);

            if (!response.ok) {
                alert("Analysis failed to start.");
                return;
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let accumulatedLog: string[] = [];
            let accumulatedPhases: any[] = [];
            let buffer = '';

            setSolverResponse({ success: false, phases: [], log: [] });
            setLiveStepPoints([]);

            while (true) {
                const { done, value } = await reader?.read()!;
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim()) continue;
                    try {
                        const update = JSON.parse(line);
                        if (update.type === 'log') {
                            accumulatedLog.push(update.content);
                            setSolverResponse(prev => prev ? { ...prev, log: [...accumulatedLog] } : { success: false, phases: [], log: [update.content] });
                        } else if (update.type === 'phase_result') {
                            setLiveStepPoints([]);
                            accumulatedPhases.push(update.content);
                            setSolverResponse(prev => prev ? {
                                ...prev,
                                phases: [...accumulatedPhases],
                            } : null);
                            setCurrentPhaseIdx(accumulatedPhases.length - 1);
                        } else if (update.type === 'step_point') {
                            setLiveStepPoints(prev => [...prev, update.content]);
                        } else if (update.type === 'final') {
                            setSolverResponse(update.content);
                        }
                    } catch (e) {
                        console.error("Stream parse error", e);
                    }
                }
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log("Analysis aborted.");
            } else {
                console.error(error);
                alert("Analysis failed.");
            }
        } finally {
            setIsRunningAnalysis(false);
            setAbortController(null);
        }
    };

    const handleCancelAnalysis = () => {
        if (abortController) {
            abortController.abort();
        }
    };

    const handleAddPolygon = (vertices: { x: number, y: number }[]) => {
        const newPoly: PolygonData = {
            vertices,
            materialId: materials[0]?.id || 'default'
        };
        setPolygons([...polygons, newPoly]);
        setDrawMode(null);
    };

    const handleAddPointLoad = (x: number, y: number) => {
        const newLoad: PointLoad = {
            id: `load_${Date.now()}`,
            x, y,
            fx: 0,
            fy: -100 // Default downward load
        };
        setPointLoads([...pointLoads, newLoad]);
        setDrawMode(null);
    };

    const handleAddLineLoad = (x1: number, y1: number, x2: number, y2: number) => {
        const newLoad: LineLoad = {
            id: `line_load_${Date.now()}`,
            x1, y1, x2, y2,
            fx: 0,
            fy: -50 // Default downward distributed load
        };
        setLineLoads([...lineLoads, newLoad]);
        setDrawMode(null);
    };

    const handleAddWaterLevel = (points: { x: number, y: number }[]) => {
        setWaterLevel(points);
        setDrawMode(null);
    };

    const handleDeleteMaterial = (id: string) => {
        setMaterials(materials.filter(m => m.id !== id));
        if (selectedEntity?.type === 'material' && selectedEntity.id === id) setSelectedEntity(null);
    };

    const handleDeletePolygon = (idx: number) => {
        setPolygons(polygons.filter((_, i) => i !== idx));
        if (selectedEntity?.type === 'polygon' && selectedEntity.id === idx) setSelectedEntity(null);
    };

    const handleDeleteLoad = (id: string) => {
        setPointLoads(pointLoads.filter(l => l.id !== id));
        setLineLoads(lineLoads.filter(l => l.id !== id));
        if (selectedEntity?.type === 'load' && selectedEntity.id === id) setSelectedEntity(null);
    };

    const handleDeleteWaterPoint = (idx: number) => {
        setWaterLevel(waterLevel.filter((_, i) => i !== idx));
        if (selectedEntity?.type === 'water_level' && selectedEntity.id === idx) setSelectedEntity(null);
    };

    const handleDeleteWaterLevel = () => {
        setWaterLevel([]);
        if (selectedEntity?.type === 'water_level') setSelectedEntity(null);
    };

    const handleSaveProject = () => {
        const metadata: ProjectMetadata = {
            lastEdited: new Date().toISOString(),
            authorName: user?.name,
            authorEmail: user?.email,
        };
        setProjectMetadata(metadata);

        const projectData: ProjectFile = {
            version: '0.1.5',
            projectName,
            metadata,
            materials,
            polygons,
            pointLoads,
            lineLoads,
            waterLevel,
            phases,
            generalSettings,
            solverSettings,
            meshSettings,
            meshResponse,
            solverResponse
        };

        const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.tsm`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleLoadProject = (file: File) => {
        if (!window.confirm("Loading a project will replace all current data. Are you sure?")) {
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target?.result as string;
                const projectData = JSON.parse(content) as ProjectFile;

                // Validate basic structure (optional but good)
                if (!projectData.version) throw new Error("Invalid project file");

                // Batch update state
                setProjectName(projectData.projectName || "Loaded Project");
                setProjectMetadata(projectData.metadata || null);
                setMaterials(projectData.materials || SAMPLE_MATERIALS);
                setPolygons(projectData.polygons || []);
                setPointLoads(projectData.pointLoads || []);
                setLineLoads(projectData.lineLoads || []);
                setWaterLevel(projectData.waterLevel || []);
                setPhases(projectData.phases || SAMPLE_PHASES);
                setGeneralSettings(projectData.generalSettings || SAMPLE_GENERAL_SETTINGS);
                setSolverSettings(projectData.solverSettings || SAMPLE_SOLVER_SETTINGS);
                if (projectData.meshSettings) setMeshSettings(projectData.meshSettings);

                // Restore execution state
                if (projectData.meshResponse && projectData.meshResponse.success) {
                    setMeshResponse(projectData.meshResponse);
                    if (projectData.solverResponse && projectData.solverResponse.success) {
                        setSolverResponse(projectData.solverResponse);
                        setActiveTab(WizardTab.RESULT);
                    } else {
                        setSolverResponse(null);
                        setActiveTab(WizardTab.MESH);
                    }
                } else {
                    setMeshResponse(null);
                    setSolverResponse(null);
                    setActiveTab(WizardTab.INPUT);
                }

                alert("Project loaded successfully!");
            } catch (err) {
                console.error("Failed to load project:", err);
                alert("Failed to load project file. Invalid format.");
            }
        };
        reader.readAsText(file);
    };

    const handleCloudSave = async () => {
        if (!user) {
            alert("Please login to save to cloud.");
            return;
        }

        const metadata: ProjectMetadata = {
            lastEdited: new Date().toISOString(),
            authorName: user.name,
            authorEmail: user.email
        };
        setProjectMetadata(metadata);

        const projectData: ProjectFile = {
            version: '0.2.1',
            projectName,
            metadata,
            materials,
            polygons,
            pointLoads,
            lineLoads,
            waterLevel,
            phases,
            generalSettings,
            solverSettings,
            meshSettings,
            meshResponse,
            solverResponse
        };

        try {
            setIsCloudSaving(true);
            if (cloudProjectId) {
                // Update existing
                await pb.collection('terrasim_projects').update(cloudProjectId, {
                    name: projectName,
                    data: projectData
                });
                alert("Project saved to cloud successfully!");
            } else {
                // Create new
                const record = await pb.collection('terrasim_projects').create({
                    user: user.id, // Assuming relation field is named 'user'
                    name: projectName,
                    data: projectData,
                    version: '0.2.1'
                });
                setCloudProjectId(record.id);
                alert("Project created on cloud successfully!");
            }
        } catch (error) {
            console.error("Cloud save failed:", error);
            alert("Failed to save project to cloud.");
        } finally {
            setIsCloudSaving(false);
        }
    };

    const handleCloudLoad = () => {
        setIsCloudModalOpen(true);
    };

    const handleLoadFromCloudData = (projectData: ProjectFile, recordId: string) => {
        if (!window.confirm("Loading a project will replace all current data. Are you sure?")) {
            return;
        }

        try {
            // Batch update state
            setProjectName(projectData.projectName || "Loaded Project");
            setProjectMetadata(projectData.metadata || null);
            setMaterials(projectData.materials || SAMPLE_MATERIALS);
            setPolygons(projectData.polygons || []);
            setPointLoads(projectData.pointLoads || []);
            setLineLoads(projectData.lineLoads || []);
            setWaterLevel(projectData.waterLevel || []);
            setPhases(projectData.phases || SAMPLE_PHASES);
            setGeneralSettings(projectData.generalSettings || SAMPLE_GENERAL_SETTINGS);
            setSolverSettings(projectData.solverSettings || SAMPLE_SOLVER_SETTINGS);
            if (projectData.meshSettings) setMeshSettings(projectData.meshSettings);

            // Restore execution state
            if (projectData.meshResponse && projectData.meshResponse.success) {
                setMeshResponse(projectData.meshResponse);
                if (projectData.solverResponse && projectData.solverResponse.success) {
                    setSolverResponse(projectData.solverResponse);
                    setActiveTab(WizardTab.RESULT);
                } else {
                    setSolverResponse(null);
                    setActiveTab(WizardTab.MESH);
                }
            } else {
                setMeshResponse(null);
                setSolverResponse(null);
                setActiveTab(WizardTab.INPUT);
            }

            setCloudProjectId(recordId);
            // alert("Project loaded from cloud successfully!");
        } catch (err) {
            console.error("Failed to load project:", err);
            alert("Failed to load project data.");
        }
    };

    const handleToggleActive = (type: 'polygon' | 'load', id: string | number) => {
        const newPhases = [...phases];
        const phase = { ...newPhases[currentPhaseIdx] };

        if (!phase.active_polygon_indices) phase.active_polygon_indices = polygons.map((_, i) => i);
        if (!phase.active_load_ids) {
            phase.active_load_ids = [...pointLoads.map(l => l.id), ...lineLoads.map(l => l.id)];
        }

        if (type === 'polygon') {
            const idx = id as number;
            if (phase.active_polygon_indices.includes(idx)) {
                phase.active_polygon_indices = phase.active_polygon_indices.filter(i => i !== idx);
            } else {
                phase.active_polygon_indices = [...phase.active_polygon_indices, idx];
            }
        } else {
            const loadId = id as string;
            if (phase.active_load_ids.includes(loadId)) {
                phase.active_load_ids = phase.active_load_ids.filter(lid => lid !== loadId);
            } else {
                phase.active_load_ids = [...phase.active_load_ids, loadId];
            }
        }

        newPhases[currentPhaseIdx] = phase;
        setPhases(newPhases);
    };

    const currentPhase = phases[currentPhaseIdx];

    return (
        <div className="flex flex-col h-screen overflow-hidden bg-slate-900 text-slate-100 selection:bg-blue-500/30">
            {!isValid && <AuthModal />}
            <WizardHeader
                activeTab={activeTab}
                onTabChange={setActiveTab}
                drawMode={drawMode}
                onDrawModeChange={setDrawMode}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
                onImportDXF={handleImportDXF}
                projectName={projectName}
                setProjectName={setProjectName}
                projectMetadata={projectMetadata}
                onSaveProject={handleSaveProject}
                onLoadProject={handleLoadProject}
                onCloudSave={handleCloudSave}
                onCloudLoad={handleCloudLoad}
                isCloudSaving={isCloudSaving}
            />

            <div className="flex-1 flex overflow-hidden relative">
                <div className="flex flex-col h-full z-10">
                    {activeTab === WizardTab.INPUT && (
                        <InputSidebar
                            materials={materials}
                            polygons={polygons}
                            pointLoads={pointLoads}
                            lineLoads={lineLoads}
                            waterLevel={waterLevel}
                            onUpdateMaterials={setMaterials}
                            onUpdatePolygons={setPolygons}
                            onUpdateLoads={setPointLoads}
                            onUpdateLineLoads={setLineLoads}
                            onUpdateWater={setWaterLevel}
                            onEditMaterial={setEditingMaterial}
                            onDeleteMaterial={handleDeleteMaterial}
                            onDeletePolygon={handleDeletePolygon}
                            onDeleteLoad={handleDeleteLoad}
                            onDeleteWaterPoint={handleDeleteWaterPoint}
                            onDeleteWaterLevel={handleDeleteWaterLevel}
                            selectedEntity={selectedEntity}
                            onSelectEntity={setSelectedEntity}
                        />
                    )}
                    {activeTab === WizardTab.MESH && (
                        <MeshSidebar
                            mesh={meshResponse}
                            isGenerating={isGeneratingMesh}
                            onGenerate={handleGenerateMesh}
                            meshSettings={meshSettings}
                            onSettingsChange={setMeshSettings}
                        />
                    )}
                    {activeTab === WizardTab.STAGING && (
                        <StagingSidebar
                            phases={phases}
                            currentPhaseIdx={currentPhaseIdx}
                            polygons={polygons}
                            pointLoads={pointLoads}
                            lineLoads={lineLoads}
                            onPhasesChange={setPhases}
                            onSelectPhase={setCurrentPhaseIdx}
                        />
                    )}
                </div>

                <div className="flex-1 relative bg-slate-950 overflow-hidden">
                    {activeTab === WizardTab.INPUT && (
                        <InputCanvas
                            polygons={polygons}
                            pointLoads={pointLoads}
                            lineLoads={lineLoads}
                            materials={materials}
                            water_level={waterLevel}
                            drawMode={drawMode}
                            onAddPolygon={handleAddPolygon}
                            onAddPointLoad={handleAddPointLoad}
                            onAddLineLoad={handleAddLineLoad}
                            onAddWaterLevel={handleAddWaterLevel}
                            onCancelDraw={() => setDrawMode(null)}
                            selectedEntity={selectedEntity}
                            onSelectEntity={setSelectedEntity}
                            onDeletePolygon={handleDeletePolygon}
                            onDeleteLoad={handleDeleteLoad}
                            onDeleteWaterPoint={handleDeleteWaterPoint}
                            onDeleteWaterLevel={handleDeleteWaterLevel}
                            generalSettings={generalSettings}
                        />
                    )}

                    {activeTab === WizardTab.STAGING && (
                        <InputCanvas
                            polygons={polygons}
                            pointLoads={pointLoads}
                            lineLoads={lineLoads}
                            materials={materials}
                            water_level={waterLevel}
                            activePolygonIndices={currentPhase?.active_polygon_indices}
                            activeLoadIds={currentPhase?.active_load_ids}
                            drawMode={null}
                            onAddPolygon={() => { }}
                            onAddPointLoad={() => { }}
                            onAddLineLoad={() => { }}
                            onAddWaterLevel={() => { }}
                            onCancelDraw={() => { }}
                            selectedEntity={null}
                            onSelectEntity={() => { }}
                            onDeletePolygon={() => { }}
                            onDeleteLoad={() => { }}
                            onDeleteWaterPoint={() => { }}
                            onDeleteWaterLevel={() => { }}
                            onToggleActive={handleToggleActive}
                            generalSettings={generalSettings}
                        />
                    )}

                    {activeTab === WizardTab.MESH && (
                        <div className="w-full h-full flex items-center justify-center relative">
                            {meshResponse?.success ? (
                                <OutputCanvas
                                    mesh={meshResponse}
                                    polygon={polygons}
                                    solverResult={null}
                                    currentPhaseIdx={0}
                                    phases={phases}
                                    showControls={false}
                                    ignorePhases={true}
                                />
                            ) : (
                                <div className="text-slate-500 text-sm animate-pulse">Click "Generate Mesh" to see the mesh</div>
                            )}
                        </div>
                    )}

                    {activeTab === WizardTab.RESULT && (
                        <div className="w-full h-full relative">
                            <OutputCanvas
                                mesh={meshResponse}
                                polygon={polygons}
                                solverResult={solverResponse}
                                currentPhaseIdx={currentPhaseIdx}
                                phases={phases}
                            />
                            <ResultSidebar
                                solverResult={solverResponse}
                                isRunning={isRunningAnalysis}
                                onRun={handleRunAnalysis}
                                onCancel={handleCancelAnalysis}
                                phases={phases}
                                currentPhaseIdx={currentPhaseIdx}
                                onSelectPhase={setCurrentPhaseIdx}
                                liveStepPoints={liveStepPoints}
                            />
                        </div>
                    )}
                </div>
            </div>

            {editingMaterial && (
                <MaterialModal
                    material={editingMaterial}
                    onSave={handleSaveMaterial}
                    onClose={() => setEditingMaterial(null)}
                />
            )}

            {isSettingsModalOpen && (
                <SettingsModal
                    generalSettings={generalSettings}
                    solverSettings={solverSettings}
                    onSave={(g, s) => {
                        setGeneralSettings(g);
                        setSolverSettings(s);
                    }}
                    onClose={() => setIsSettingsModalOpen(false)}
                />
            )}

            {isCloudModalOpen && (
                <CloudLoadModal
                    onLoad={handleLoadFromCloudData}
                    onClose={() => setIsCloudModalOpen(false)}
                />
            )}

            <div className="fixed bottom-3 right-3 z-[100] items-center justify-center flex flex-col bg-slate-900/90 backdrop-blur-md py-2 px-4 rounded-xl border border-slate-700 shadow-2xl text-slate-400 z-[20]">
                <div className="text-[10px]">Copyright © 2026 | Dahar Engineer</div>
                <div className="text-[10px] border-b border-slate-700 w-full text-center">All rights reserved.</div>
                <div className="text-[8px]">This software is still under development.</div>
                <div className="text-[8px]">Please use it at your own risk.</div>
            </div>
        </div>
    );
}

export default function App() {
    return (
        <AuthProvider>
            <MainApp />
        </AuthProvider>
    );
}
