import React, { useState } from 'react';
import { PolygonData, Material, PointLoad } from '../types';
import { ChevronDown, Pencil, Trash } from 'lucide-react';
import { MathRender } from './Math';

interface InputSidebarProps {
    materials: Material[];
    polygons: PolygonData[];
    pointLoads: PointLoad[];
    waterLevel: { x: number; y: number }[];
    onUpdateMaterials: (m: Material[]) => void;
    onUpdatePolygons: (p: PolygonData[]) => void;
    onUpdateLoads: (l: PointLoad[]) => void;
    onUpdateWater: (w: { x: number; y: number }[]) => void;
    onEditMaterial: (mat: Material) => void;
    onDeleteMaterial: (id: string) => void;
    onDeletePolygon: (idx: number) => void;
    onDeleteLoad: (id: string) => void;
    onDeleteWaterPoint: (idx: number) => void;
    onDeleteWaterLevel: () => void;
    selectedEntity: { type: string, id: string | number } | null;
    onSelectEntity: (selection: { type: string, id: string | number } | null) => void;
}

export const InputSidebar: React.FC<InputSidebarProps> = ({
    materials,
    polygons,
    pointLoads,
    waterLevel,
    onUpdateMaterials,
    onUpdatePolygons,
    onUpdateLoads,
    onUpdateWater,
    onEditMaterial,
    onDeleteMaterial,
    onDeletePolygon,
    onDeleteLoad,
    onDeleteWaterPoint,
    onDeleteWaterLevel,
    selectedEntity,
    onSelectEntity
}) => {
    const handleAddMaterial = () => {
        const firstMat = materials[0];
        const newMat: Material = {
            id: `mat_${Date.now()}`,
            name: 'New Material',
            color: '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0'),
            youngsModulus: 20000,
            poissonsRatio: 0.3,
            unitWeightSaturated: 20,
            unitWeightUnsaturated: 18,
            material_model: firstMat?.material_model,
            drainage_type: firstMat?.drainage_type
        };
        onUpdateMaterials([...materials, newMat]);
    };

    const handleUpdateMatColor = (id: string, color: string) => {
        onUpdateMaterials(materials.map(m => m.id === id ? { ...m, color } : m));
    };

    const handleUpdatePolygonMat = (idx: number, matId: string) => {
        const newPolys = [...polygons];
        newPolys[idx] = { ...newPolys[idx], materialId: matId };
        onUpdatePolygons(newPolys);
    };

    // const handleAddPolygon = () => {
    //     const newPoly: PolygonData = {
    //         materialId: materials[0]?.id || 'mat_sand',
    //         vertices: [
    //             { x: 0, y: 0 },
    //             { x: 5, y: 0 },
    //             { x: 5, y: 5 },
    //             { x: 0, y: 5 }
    //         ],
    //         mesh_size: 1.0,
    //         boundary_refinement_factor: 1.0
    //     };
    //     onUpdatePolygons([...polygons, newPoly]);
    // };

    const handleAddLoad = () => {
        const newLoad: PointLoad = {
            id: `load_${pointLoads.length + 1}`,
            x: 0,
            y: 10,
            fx: 0,
            fy: -100
        };
        onUpdateLoads([...pointLoads, newLoad]);
    };

    const handleUpdateWaterX = (idx: number, val: number) => {
        const newWater = [...waterLevel];
        newWater[idx] = { ...newWater[idx], x: val };
        onUpdateWater(newWater);
    };

    const handleUpdateWaterY = (idx: number, val: number) => {
        const newWater = [...waterLevel];
        newWater[idx] = { ...newWater[idx], y: val };
        onUpdateWater(newWater);
    };

    const [isMaterialOpen, setIsMaterialOpen] = useState(true);
    const [isPolygonOpen, setIsPolygonOpen] = useState(true);
    const [isLoadOpen, setIsLoadOpen] = useState(true);
    const [isWaterOpen, setIsWaterOpen] = useState(true);

    return (
        <div className="w-[350px] h-full overflow-y-auto bg-slate-900 border-r border-slate-700 custom-scrollbar">
            <div className="dropdownlabel">Materials
                <button
                    onClick={() => { setIsMaterialOpen(!isMaterialOpen) }}
                    className="cursor-pointer p-1.5 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 hover:text-white transition-colors">
                    <ChevronDown className={`w-4 h-4 transition ${isMaterialOpen ? "rotate-180" : ""}`} />
                </button>
            </div>
            {isMaterialOpen && (
                <div className="p-3 space-y-2">
                    {materials.map(mat => (
                        <div
                            key={mat.id}
                            onClick={() => onSelectEntity({ type: 'material', id: mat.id })}
                            className={`flex flex-col gap-1 p-2 bg-slate-800 rounded-lg border transition-all cursor-pointer ${selectedEntity?.type === 'material' && selectedEntity.id === mat.id ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-slate-700 hover:border-slate-600'}`}
                        >
                            <div className="flex items-center gap-2">
                                <input
                                    type="color"
                                    value={mat.color}
                                    onChange={(e) => handleUpdateMatColor(mat.id, e.target.value)}
                                    className="w-6 h-6 p-0 border-none bg-transparent cursor-pointer rounded overflow-hidden"
                                />
                                <div className="flex-1 min-w-0">
                                    <div className="itemlabel">{mat.name}</div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onEditMaterial(mat); }}
                                        className="cursor-pointer p-1.5 rounded hover:bg-slate-600 hover:text-white transition-colors"
                                        title="Edit Material"
                                    >
                                        <Pencil className='w-3.5 h-3.5' />
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDeleteMaterial(mat.id); }}
                                        className="cursor-pointer p-1.5 rounded hover:bg-rose-500/20 hover:text-rose-500 transition-colors"
                                        title="Delete Material"
                                    >
                                        <Trash className='w-3.5 h-3.5' />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    <button
                        onClick={handleAddMaterial}
                        className="add-button"
                    >
                        + Add Material
                    </button>
                </div>
            )}

            <div className="dropdownlabel">Polygons
                <button
                    onClick={() => { setIsPolygonOpen(!isPolygonOpen) }}
                    className="cursor-pointer p-1.5 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 hover:text-white transition-colors">
                    <ChevronDown className={`w-4 h-4 transition ${isPolygonOpen ? "rotate-180" : ""}`} />
                </button>
            </div>
            {isPolygonOpen && (
                <div className="p-3 space-y-2">
                    {polygons.map((poly, i) => (
                        <div
                            key={i}
                            onClick={() => onSelectEntity({ type: 'polygon', id: i })}
                            className={`flex flex-col gap-1 p-2 bg-slate-800 rounded-lg border transition-all cursor-pointer ${selectedEntity?.type === 'polygon' && selectedEntity.id === i ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-slate-700'}`}
                        >
                            <div className="flex justify-between items-center">
                                <span className="itemlabel">Poly {i + 1}</span>
                                <div className="flex gap-2">
                                    <select
                                        value={poly.materialId}
                                        onChange={(e) => handleUpdatePolygonMat(i, e.target.value)}
                                        className="cursor-pointer bg-slate-900 border border-slate-700 text-[10px] px-1 py-0.5 rounded text-slate-100 outline-none focus:border-blue-500"
                                    >
                                        {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onDeletePolygon(i); }}
                                        className="cursor-pointer p-1.5 rounded hover:bg-rose-500/20 hover:text-rose-500 transition-colors"
                                        title="Delete Polygon"
                                    >
                                        <Trash className='w-3.5 h-3.5' />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    {/* <button
                        onClick={handleAddPolygon}
                        className="add-button"
                    >
                        + Add Polygon
                    </button> */}
                </div>
            )}

            <div className="dropdownlabel">Water Level
                <button
                    onClick={() => { setIsWaterOpen(!isWaterOpen) }}
                    className="cursor-pointer p-1.5 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 hover:text-white transition-colors">
                    <ChevronDown className={`w-4 h-4 transition ${isWaterOpen ? "rotate-180" : ""}`} />
                </button>
            </div>
            {isWaterOpen && (
                <div className="p-2 space-y-2">
                    <div className="flex px-2 justify-between items-center w-full text-xs">
                        <div className="w-1/2">
                            X <MathRender tex="(m)" />
                        </div>
                        <div className="w-1/2">
                            Y <MathRender tex="(m)" />
                        </div>
                    </div>
                    {waterLevel.map((p, i) => (
                        <div
                            key={i}
                            onClick={() => onSelectEntity({ type: 'water_level', id: i })}
                            className={`flex justify-between items-center gap-1 p-1 rounded transition-all cursor-pointer ${selectedEntity?.type === 'water_level' && selectedEntity.id === i ? 'bg-blue-500/10 ring-1 ring-blue-500/50' : ''}`}
                        >
                            <div className="flex-1 flex gap-1">
                                <input
                                    type="number"
                                    value={p.x}
                                    onChange={(e) => handleUpdateWaterX(i, Number(e.target.value))}
                                    className="flex-1 bg-slate-900 border border-slate-700 text-slate-100 text-[11px] p-1 rounded outline-none focus:border-blue-500"
                                />
                                <input
                                    type="number"
                                    value={p.y}
                                    onChange={(e) => handleUpdateWaterY(i, Number(e.target.value))}
                                    className="flex-1 bg-slate-900 border border-slate-700 text-slate-100 text-[11px] p-1 rounded outline-none focus:border-blue-500"
                                />
                            </div>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDeleteWaterPoint(i); }}
                                className="cursor-pointer p-1.5 text-slate-500 hover:text-rose-500 transition-colors"
                            >
                                <Trash className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    ))}
                    <div className="flex gap-2">
                        <button
                            onClick={() => onUpdateWater([...waterLevel, { x: 0, y: 0 }])}
                            className="add-button"
                        >
                            + Add Water Point
                        </button>
                        <button
                            onClick={onDeleteWaterLevel}
                            className="cursor-pointer p-1.5 text-rose-400 hover:text-rose-300 transition-colors"
                            title="Delete All Water Points"
                        >
                            <Trash className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            )}

            <div className="dropdownlabel">Point Loads
                <button
                    onClick={() => { setIsLoadOpen(!isLoadOpen) }}
                    className="cursor-pointer p-1.5 bg-slate-700 text-slate-300 rounded hover:bg-slate-600 hover:text-white transition-colors">
                    <ChevronDown className={`w-4 h-4 transition ${isLoadOpen ? "rotate-180" : ""}`} />
                </button>
            </div>
            {isLoadOpen && (
                <div className="p-4 space-y-2">
                    {pointLoads.map((load, i) => (
                        <div
                            key={load.id}
                            onClick={() => onSelectEntity({ type: 'load', id: load.id })}
                            className={`flex flex-col gap-1 p-2 bg-slate-800 rounded border transition-all cursor-pointer ${selectedEntity?.type === 'load' && selectedEntity.id === load.id ? 'border-blue-500 ring-1 ring-blue-500/50' : 'border-slate-700'}`}
                        >
                            <div className="flex justify-between items-center">
                                <span className="itemlabel">{load.id}</span>
                                <button
                                    onClick={(e) => { e.stopPropagation(); onDeleteLoad(load.id); }}
                                    className="cursor-pointer p-1.5 text-slate-500 hover:text-rose-500 transition-colors"
                                >
                                    <Trash className="w-3.5 h-3.5" />
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div className="flex flex-col gap-1">
                                    <span className="sublabel">Coord X <MathRender tex="(m)" /></span>
                                    <input
                                        type="number"
                                        value={load.x}
                                        onChange={(e) => {
                                            const next = [...pointLoads];
                                            next[i] = { ...next[i], x: Number(e.target.value) };
                                            onUpdateLoads(next);
                                        }}
                                        className="bg-slate-900 border border-slate-700 text-slate-100 text-[10px] px-2 py-1 rounded outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="sublabel">Coord Y <MathRender tex="(m)" /></span>
                                    <input
                                        type="number"
                                        value={load.y}
                                        onChange={(e) => {
                                            const next = [...pointLoads];
                                            next[i] = { ...next[i], y: Number(e.target.value) };
                                            onUpdateLoads(next);
                                        }}
                                        className="bg-slate-900 border border-slate-700 text-slate-100 text-[10px] px-2 py-1 rounded outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="sublabel">Force Fx <MathRender tex="(kN)" /></span>
                                    <input
                                        type="number"
                                        value={load.fx}
                                        onChange={(e) => {
                                            const next = [...pointLoads];
                                            next[i] = { ...next[i], fx: Number(e.target.value) };
                                            onUpdateLoads(next);
                                        }}
                                        className="bg-slate-900 border border-slate-700 text-slate-100 text-[10px] px-2 py-1 rounded outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div className="flex flex-col gap-1">
                                    <span className="sublabel">Force Fy <MathRender tex="(kN)" /></span>
                                    <input
                                        type="number"
                                        value={load.fy}
                                        onChange={(e) => {
                                            const next = [...pointLoads];
                                            next[i] = { ...next[i], fy: Number(e.target.value) };
                                            onUpdateLoads(next);
                                        }}
                                        className="bg-slate-900 border border-slate-700 text-slate-100 text-[10px] px-2 py-1 rounded outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                    <button
                        onClick={handleAddLoad}
                        className="add-button"
                    >
                        + Add Load
                    </button>
                </div>
            )}
        </div>
    );
};
