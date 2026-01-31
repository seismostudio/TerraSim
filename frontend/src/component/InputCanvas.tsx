import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrthographicCamera, OrbitControls, Grid, Line } from '@react-three/drei';
import * as THREE from 'three';
import { Ruler } from './Ruler';
import { PolygonData, PointLoad, Material, GeneralSettings } from '../types';

interface InputCanvasProps {
    polygons: PolygonData[];
    pointLoads: PointLoad[];
    materials: Material[];
    water_level?: { x: number, y: number }[];
    activePolygonIndices?: number[];
    activeLoadIds?: string[];
    drawMode: string | null;
    onAddPolygon: (vertices: { x: number, y: number }[]) => void;
    onAddPointLoad: (x: number, y: number) => void;
    onAddWaterLevel: (vertices: { x: number, y: number }[]) => void;
    onCancelDraw: () => void;
    selectedEntity: { type: string, id: string | number } | null;
    onSelectEntity: (selection: { type: string, id: string | number } | null) => void;
    onDeletePolygon: (idx: number) => void;
    onDeleteLoad: (id: string) => void;
    onDeleteWaterPoint: (idx: number) => void;
    onDeleteWaterLevel: () => void;
    onToggleActive?: (type: 'polygon' | 'load', id: string | number) => void;
    generalSettings: GeneralSettings;
}

interface PolygonProps {
    data: PolygonData;
    materials: Material[];
    isSelected: boolean;
    isActive: boolean;
    onSelect: () => void;
    onContextMenu: (x: number, y: number) => void;
}

const Polygon = ({ data, materials, isSelected, isActive, onSelect, onContextMenu }: PolygonProps) => {
    const material = materials.find(m => m.id === data.materialId);
    let fillColor = material ? material.color : '#334155';
    let lineColor = "white";

    if (!isActive) {
        fillColor = "#334155"; // Neutral gray for inactive
        lineColor = "#64748b";
    }

    const { shape, points } = useMemo(() => {
        const shape = new THREE.Shape();
        const pts: THREE.Vector3[] = [];

        data.vertices.forEach((v, i) => {
            if (i === 0) shape.moveTo(v.x, v.y);
            else shape.lineTo(v.x, v.y);
            pts.push(new THREE.Vector3(v.x, v.y, 0.05));
        });

        shape.closePath();
        pts.push(pts[0]); // Close outline
        return { shape, points: pts };
    }, [data]);

    return (
        <group onContextMenu={(e) => { e.nativeEvent.preventDefault(); e.stopPropagation(); onContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY); }}>
            {/* Fill */}
            <mesh
                position={[0, 0, 0]}
                onClick={(e) => { e.stopPropagation(); onSelect(); }}
            >
                <shapeGeometry args={[shape]} />
                <meshBasicMaterial
                    color={fillColor}
                    opacity={isSelected ? 0.8 : (isActive ? 0.5 : 0.2)}
                    transparent
                    side={THREE.DoubleSide}
                />
            </mesh>
            {/* Outline */}
            <Line points={points} color={isSelected ? "#3b82f6" : lineColor} lineWidth={isSelected ? 3 : 1} />
            {/* Nodes */}
            {points.map((p, i) => (
                <mesh key={i} position={p}>
                    <circleGeometry args={[0.05, 16]} />
                    <meshBasicMaterial color={isActive ? "white" : "#475569"} />
                </mesh>
            ))}
        </group>
    );
};

const LoadMarker = ({ load, isSelected, isActive, onSelect, onContextMenu }: {
    load: PointLoad,
    isSelected: boolean,
    isActive: boolean,
    onSelect: () => void,
    onContextMenu: (x: number, y: number) => void
}) => {
    const dir = new THREE.Vector3(load.fx, load.fy, 0).normalize();
    const length = 2.0;
    const headLen = 0.5;
    const origin = new THREE.Vector3(load.x, load.y + 0.2, 0.1);
    const shaftStart = origin.clone().sub(dir.clone().multiplyScalar(length));

    const angle = Math.atan2(dir.y, dir.x);
    let color = isSelected ? "#60a5fa" : (isActive ? "#ef4444" : "#475569");

    return (
        <group
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
            onContextMenu={(e) => { e.nativeEvent.preventDefault(); e.stopPropagation(); onContextMenu(e.nativeEvent.clientX, e.nativeEvent.clientY); }}
        >
            {/* Shaft - Thick line */}
            <Line
                points={[shaftStart, origin]}
                color={color}
                lineWidth={3}
            />
            {/* Arrow Head */}
            <mesh position={origin} rotation={[0, 0, angle - Math.PI / 2]}>
                <coneGeometry args={[0.25, headLen, 4]} />
                <meshBasicMaterial color={color} />
            </mesh>
            {/* Invisible larger click area */}
            <mesh position={origin.clone().sub(dir.clone().multiplyScalar(length / 2))} rotation={[0, 0, angle - Math.PI / 2]}>
                <boxGeometry args={[0.6, length, 0.1]} />
                <meshBasicMaterial transparent opacity={0} />
            </mesh>
        </group>
    );
};

// --- DRAWING MANAGER ---
const DrawingManager = ({ mode, onAddPolygon, onAddPointLoad, onAddWaterLevel, onCancel, generalSettings }: {
    mode: string | null;
    onAddPolygon: (pts: { x: number, y: number }[]) => void;
    onAddPointLoad: (x: number, y: number) => void;
    onAddWaterLevel: (pts: { x: number, y: number }[]) => void;
    onCancel: () => void;
    generalSettings: GeneralSettings;
}) => {
    const { camera, mouse, raycaster } = useThree();
    const [tempPoints, setTempPoints] = useState<THREE.Vector3[]>([]);
    const [previewPoint, setPreviewPoint] = useState<THREE.Vector3 | null>(null);
    const mountTime = useRef(Date.now());

    useEffect(() => {
        mountTime.current = Date.now();
        setTempPoints([]);
        setPreviewPoint(null);
    }, [mode]);

    const getWorldPos = useCallback(() => {
        raycaster.setFromCamera(mouse, camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
        const target = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, target);

        if (generalSettings.snapToGrid) {
            const s = generalSettings.snapSpacing;
            return new THREE.Vector3(
                Math.round(target.x / s) * s,
                Math.round(target.y / s) * s,
                0.4
            );
        }
        return new THREE.Vector3(target.x, target.y, 0.4);
    }, [camera, mouse, raycaster, generalSettings]);

    useEffect(() => {
        if (!mode) return;

        const handleDown = (e: MouseEvent) => {
            if (e.button !== 0 || Date.now() - mountTime.current < 200) return;
            const pos = getWorldPos();

            if (mode === 'point_load') {
                onAddPointLoad(pos.x, pos.y);
            } else if (mode === 'rectangle') {
                if (tempPoints.length === 0) {
                    setTempPoints([pos]);
                } else {
                    const p1 = tempPoints[0];
                    const vertices = [
                        { x: p1.x, y: p1.y },
                        { x: pos.x, y: p1.y },
                        { x: pos.x, y: pos.y },
                        { x: p1.x, y: pos.y }
                    ];
                    onAddPolygon(vertices);
                    setTempPoints([]);
                }
            } else {
                setTempPoints(prev => [...prev, pos]);
            }
        };

        const handleMove = () => {
            setPreviewPoint(getWorldPos());
        };

        const handleKeys = (e: KeyboardEvent) => {
            if (e.key === 'Enter') {
                if (tempPoints.length >= 2) {
                    const vertices = tempPoints.map(p => ({ x: p.x, y: p.y }));
                    if (mode === 'polygon') onAddPolygon(vertices);
                    if (mode === 'water_level') onAddWaterLevel(vertices);
                }
                setTempPoints([]);
            } else if (e.key === 'Escape') {
                setTempPoints([]);
                onCancel();
            }
        };

        window.addEventListener('mousedown', handleDown);
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('keydown', handleKeys);
        return () => {
            window.removeEventListener('mousedown', handleDown);
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('keydown', handleKeys);
        };
    }, [mode, getWorldPos, tempPoints, onAddPolygon, onAddPointLoad, onAddWaterLevel, onCancel]);

    if (!mode) return null;

    const linePoints = [...tempPoints];
    if (previewPoint) {
        if (mode === 'rectangle' && tempPoints.length === 1) {
            const p1 = tempPoints[0];
            linePoints.push(new THREE.Vector3(previewPoint.x, p1.y, 0.4));
            linePoints.push(new THREE.Vector3(previewPoint.x, previewPoint.y, 0.4));
            linePoints.push(new THREE.Vector3(p1.x, previewPoint.y, 0.4));
            linePoints.push(new THREE.Vector3(p1.x, p1.y, 0.4));
        } else {
            linePoints.push(previewPoint);
        }
    }

    return (
        <group>
            {linePoints.length >= 2 && (
                <Line points={linePoints} color="yellow" lineWidth={2} dashed={true} />
            )}
            {tempPoints.map((p, i) => (
                <mesh key={i} position={p}>
                    <circleGeometry args={[0.1, 16]} />
                    <meshBasicMaterial color="yellow" />
                </mesh>
            ))}
            {previewPoint && (
                <mesh position={previewPoint}>
                    <circleGeometry args={[0.1, 16]} />
                    <meshBasicMaterial color="yellow" opacity={0.5} transparent />
                </mesh>
            )}
        </group>
    );
};

export const InputCanvas: React.FC<InputCanvasProps> = ({
    polygons, pointLoads, materials, water_level,
    activePolygonIndices, activeLoadIds,
    drawMode, onAddPolygon, onAddPointLoad, onAddWaterLevel, onCancelDraw,
    selectedEntity, onSelectEntity, onDeletePolygon, onDeleteLoad, onDeleteWaterPoint, onToggleActive,
    generalSettings
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, target: { type: 'polygon' | 'load', id: string | number } } | null>(null);

    // Handling Delete Key for canvas-based deletion
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (!selectedEntity) return;
                if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT') return;

                if (selectedEntity.type === 'polygon') {
                    onDeletePolygon(selectedEntity.id as number);
                } else if (selectedEntity.type === 'load') {
                    onDeleteLoad(selectedEntity.id as string);
                } else if (selectedEntity.type === 'water_level') {
                    onDeleteWaterPoint(selectedEntity.id as number);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedEntity, onDeletePolygon, onDeleteLoad, onDeleteWaterPoint]);

    // Close context menu on click elsewhere
    useEffect(() => {
        const handleGlobalClick = () => setContextMenu(null);
        window.addEventListener('click', handleGlobalClick);
        return () => window.removeEventListener('click', handleGlobalClick);
    }, []);

    const handleContextMenu = (clientX: number, clientY: number, target: { type: 'polygon' | 'load', id: string | number }) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        setContextMenu({
            x: clientX - rect.left,
            y: clientY - rect.top,
            target
        });
    };

    return (
        <div ref={containerRef} className="w-full h-full bg-slate-900 overflow-hidden outline-none relative">
            <Canvas onPointerMissed={() => onSelectEntity(null)}>
                <OrthographicCamera makeDefault position={[0, 0, 90]} zoom={20} />
                <OrbitControls enableRotate={false} />
                <ambientLight intensity={1.0} />
                <Grid position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]} args={[500, 500]} sectionColor="#535c66" fadeDistance={100} />
                <Ruler />

                {water_level && water_level.length > 0 && (
                    <group onClick={(e) => { e.stopPropagation(); }}>
                        <Line
                            points={water_level.map(p => new THREE.Vector3(p.x, p.y, 0.4))}
                            color="cyan"
                            lineWidth={2}
                        />
                        {water_level.map((p, i) => (
                            <mesh
                                key={i}
                                position={[p.x, p.y, 0.45]}
                                onClick={(e) => { e.stopPropagation(); onSelectEntity({ type: 'water_level', id: i }); }}
                            >
                                <circleGeometry args={[selectedEntity?.type === 'water_level' && selectedEntity.id === i ? 0.3 : 0.15, 16]} />
                                <meshBasicMaterial color={selectedEntity?.type === 'water_level' && selectedEntity.id === i ? "#3b82f6" : "cyan"} />
                            </mesh>
                        ))}
                    </group>
                )}

                {polygons.map((poly, i) => {
                    const isSelected = selectedEntity?.type === 'polygon' && selectedEntity.id === i;
                    const isActive = activePolygonIndices ? activePolygonIndices.includes(i) : true;
                    return (
                        <Polygon
                            key={i}
                            data={poly}
                            materials={materials}
                            isSelected={isSelected}
                            isActive={isActive}
                            onSelect={() => onSelectEntity({ type: 'polygon', id: i })}
                            onContextMenu={(x, y) => handleContextMenu(x, y, { type: 'polygon', id: i })}
                        />
                    );
                })}

                {pointLoads.map((load) => {
                    const isSelected = selectedEntity?.type === 'load' && selectedEntity.id === load.id;
                    const isActive = activeLoadIds ? activeLoadIds.includes(load.id) : true;
                    return (
                        <LoadMarker
                            key={load.id}
                            load={load}
                            isSelected={isSelected}
                            isActive={isActive}
                            onSelect={() => onSelectEntity({ type: 'load', id: load.id })}
                            onContextMenu={(x, y) => handleContextMenu(x, y, { type: 'load', id: load.id })}
                        />
                    );
                })}

                <DrawingManager
                    mode={drawMode}
                    onAddPolygon={onAddPolygon}
                    onAddPointLoad={onAddPointLoad}
                    onAddWaterLevel={onAddWaterLevel}
                    onCancel={onCancelDraw}
                    generalSettings={generalSettings}
                />
            </Canvas>

            {contextMenu && onToggleActive && (
                <div
                    className="absolute bg-slate-800 border border-slate-700 rounded-lg shadow-xl py-1 z-50 min-w-[120px]"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <button
                        className="cursor-pointer w-full text-left px-4 py-2 text-[10px] font-bold text-slate-100 hover:bg-slate-700 transition"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleActive(contextMenu.target.type, contextMenu.target.id);
                            setContextMenu(null);
                        }}
                    >
                        {(contextMenu.target.type === 'polygon'
                            ? activePolygonIndices?.includes(contextMenu.target.id as number)
                            : activeLoadIds?.includes(contextMenu.target.id as string))
                            ? 'Deactivate Element'
                            : 'Activate Element'}
                    </button>
                </div>
            )}
        </div>
    );
};
