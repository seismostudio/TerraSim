import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrthographicCamera, OrbitControls, Grid, Line } from '@react-three/drei';
import * as THREE from 'three';
import { MeshResponse, SolverResponse, OutputType, PhaseRequest, PolygonData } from '../types';
import { MathRender } from './Math';

interface OutputCanvasProps {
    mesh: MeshResponse | null;
    polygon: PolygonData[];
    solverResult: SolverResponse | null;
    currentPhaseIdx: number;
    phases: PhaseRequest[];
    showControls?: boolean;
    ignorePhases?: boolean;
}

interface PolygonProps {
    data: PolygonData;
}

// Helper to map 0-1 to Rainbow Color (Blue -> Cyan -> Green -> Yellow -> Red)
const getJetColor = (v: number) => {
    const t = Math.max(0, Math.min(1, v));
    // Simple segmented interpolation for Jet-like scale
    if (t < 0.125) return [0, 0, 0.5 + 4 * t]; // Dark Blue to Blue
    if (t < 0.375) return [0, 4 * (t - 0.125), 1]; // Blue to Cyan
    if (t < 0.625) return [4 * (t - 0.375), 1, 1 - 4 * (t - 0.375)]; // Cyan to Yellow
    if (t < 0.875) return [1, 1 - 4 * (t - 0.625), 0]; // Yellow to Red
    return [1.0 - 0.5 * (t - 0.875), 0, 0]; // Red to Dark Red
};

// User Request: Negative (min) = Red, Positive (max) = Blue
const getStressColor = (v: number) => {
    // Invert the Jet color mapping
    return getJetColor(1 - v);
};

const MeshResult = ({
    mesh,
    solverResult,
    currentPhaseIdx,
    phases,
    deformationScale,
    outputType,
    onValueRangeChange,
    ignorePhases = false
}: {
    mesh: MeshResponse,
    solverResult: SolverResponse | null,
    currentPhaseIdx: number,
    phases: PhaseRequest[],
    deformationScale: number,
    outputType: OutputType,
    onValueRangeChange: (min: number, max: number, label: React.ReactNode) => void,
    ignorePhases?: boolean
}) => {
    const { positions, colors, wireframePositions, rangeData } = useMemo(() => {
        if (!mesh) return {
            positions: new Float32Array(0),
            indices: new Uint32Array(0),
            colors: new Float32Array(0),
            wireframePositions: new Float32Array(0),
            rangeData: { min: 0, max: 0, label: "" }
        };

        const phaseResult = solverResult?.phases?.[currentPhaseIdx];
        const phaseRequest = phases[currentPhaseIdx];
        const activePolygons = new Set(phaseRequest?.active_polygon_indices || []);

        const isSolidMaterial = outputType === OutputType.DEFORMED_MESH;

        // Find active elements
        const activeElementIndices: number[] = [];
        mesh.elements.forEach((_, i) => {
            const elemMaterial = mesh.element_materials[i];
            const isMeshActive = ignorePhases || (elemMaterial && (elemMaterial.polygon_id === undefined || activePolygons.has(elemMaterial.polygon_id)));
            if (isMeshActive) {
                activeElementIndices.push(i);
            }
        });

        // Helper to get deformed position
        const getDeformedPos = (nIdx: number) => {
            let x = mesh.nodes[nIdx][0];
            let y = mesh.nodes[nIdx][1];
            if (phaseResult) {
                const d = phaseResult.displacements.find(d => d.id === nIdx + 1);
                if (d) {
                    const resetVisual = phaseRequest?.reset_displacements || false;
                    const parentPhaseResult = currentPhaseIdx > 0 ? solverResult?.phases?.[currentPhaseIdx - 1] : null;
                    let dx = d.ux;
                    let dy = d.uy;
                    if (resetVisual && parentPhaseResult) {
                        const pd = parentPhaseResult.displacements.find(pd => pd.id === nIdx + 1);
                        if (pd) {
                            dx -= pd.ux;
                            dy -= pd.uy;
                        }
                    }
                    x += dx * deformationScale;
                    y += dy * deformationScale;
                }
            }
            return [x, y, 0];
        };

        if (isSolidMaterial) {
            // 1 Triangle per element for solid materials (efficiency + clean edges)
            const pos = new Float32Array(activeElementIndices.length * 3 * 3);
            const col = new Float32Array(activeElementIndices.length * 3 * 3);
            const wfPos = new Float32Array(activeElementIndices.length * 6 * 2 * 3); // 6 outer segments

            activeElementIndices.forEach((elemIdx, i) => {
                const elem = mesh.elements[elemIdx];
                const mat = mesh.element_materials[elemIdx]?.material;
                const mColor = mat?.color ? new THREE.Color(mat.color) : new THREE.Color(0.23, 0.51, 0.96);

                const [n1, n2, n3, n12, n23, n31] = elem;

                // Fill: Use standard 3 corner nodes for a solid triangle
                const triNodes = [n1, n2, n3];
                triNodes.forEach((nIdx, vIdx) => {
                    const dPos = getDeformedPos(nIdx);
                    const baseIdx = (i * 3 + vIdx) * 3;
                    pos[baseIdx] = dPos[0];
                    pos[baseIdx + 1] = dPos[1];
                    pos[baseIdx + 2] = dPos[2];
                    col[baseIdx] = mColor.r;
                    col[baseIdx + 1] = mColor.g;
                    col[baseIdx + 2] = mColor.b;
                });

                // Wireframe: 6 outer segments forming the quadratic boundary (visualized linearly)
                const wfEdges = [[n1, n12], [n12, n2], [n2, n23], [n23, n3], [n3, n31], [n31, n1]];
                wfEdges.forEach((edge, eIdx) => {
                    const p1 = getDeformedPos(edge[0]);
                    const p2 = getDeformedPos(edge[1]);
                    const baseIdx = (i * 6 + eIdx) * 6;
                    wfPos[baseIdx] = p1[0]; wfPos[baseIdx + 1] = p1[1]; wfPos[baseIdx + 2] = p1[2];
                    wfPos[baseIdx + 3] = p2[0]; wfPos[baseIdx + 4] = p2[1]; wfPos[baseIdx + 5] = p2[2];
                });
            });

            return {
                positions: pos,
                indices: new Uint32Array(0),
                colors: col,
                wireframePositions: wfPos,
                rangeData: { min: 0, max: 0, label: "" }
            };
        } else {
            const polygonGroups = new Map<number, number[]>();
            activeElementIndices.forEach(elemIdx => {
                const mat = mesh.element_materials[elemIdx];
                const polyId = mat?.polygon_id ?? -1;
                if (!polygonGroups.has(polyId)) polygonGroups.set(polyId, []);
                polygonGroups.get(polyId)!.push(elemIdx);
            });

            const groupNodeValues = new Map<number, Map<number, number>>();
            let currentLabel: React.ReactNode = "";

            const getStressValue = (s: any) => {
                const p_steady = s.pwp_steady || 0;
                const p_excess = s.pwp_excess || 0;
                const p_total = s.pwp_total || 0;
                if (outputType === OutputType.PWP_STEADY) return p_steady;
                if (outputType === OutputType.PWP_EXCESS) return p_excess;
                if (outputType === OutputType.PWP_TOTAL) return p_total;
                const avg = (s.sig_xx + s.sig_yy) / 2;
                const diff = (s.sig_xx - s.sig_yy) / 2;
                const radius = Math.sqrt(diff * diff + s.sig_xy * s.sig_xy);
                if (outputType === OutputType.SIGMA_1) return avg - radius; // major principal stress (use - for compression)
                if (outputType === OutputType.SIGMA_3) return avg + radius; // minor principal stress (use + for tension)
                const sxx_eff = s.sig_xx - p_total;
                const syy_eff = s.sig_yy - p_total;
                const avg_eff = (sxx_eff + syy_eff) / 2;
                const diff_eff = (sxx_eff - syy_eff) / 2;
                const r_eff = Math.sqrt(diff_eff * diff_eff + s.sig_xy * s.sig_xy);
                if (outputType === OutputType.SIGMA_1_EFF) return avg_eff - r_eff; // major principal stress (use - for compression)
                if (outputType === OutputType.SIGMA_3_EFF) return avg_eff + r_eff; // minor principal stress (use + for tension)
                return 0;
            };

            if (outputType === OutputType.PWP_STEADY) currentLabel = <span className="flex items-center gap-1">PWP Steady <MathRender tex="(kN/m^2)" /></span>;
            else if (outputType === OutputType.PWP_EXCESS) currentLabel = <span className="flex items-center gap-1">PWP Excess <MathRender tex="(kN/m^2)" /></span>;
            else if (outputType === OutputType.PWP_TOTAL) currentLabel = <span className="flex items-center gap-1">PWP Total <MathRender tex="(kN/m^2)" /></span>;
            else if (outputType === OutputType.SIGMA_1) currentLabel = <span className="flex items-center gap-1"><MathRender tex="\sigma_1" /> <MathRender tex="(kN/m^2)" /></span>;
            else if (outputType === OutputType.SIGMA_3) currentLabel = <span className="flex items-center gap-1"><MathRender tex="\sigma_3" /> <MathRender tex="(kN/m^2)" /></span>;
            else if (outputType === OutputType.SIGMA_1_EFF) currentLabel = <span className="flex items-center gap-1"><MathRender tex="\sigma'_1" /> <MathRender tex="(kN/m^2)" /></span>;
            else if (outputType === OutputType.SIGMA_3_EFF) currentLabel = <span className="flex items-center gap-1"><MathRender tex="\sigma'_3" /> <MathRender tex="(kN/m^2)" /></span>;

            const stressMap = new Map<number, any>();
            phaseResult?.stresses.forEach(s => stressMap.set(s.element_id, s));
            const dispMap = new Map<number, any>();
            phaseResult?.displacements.forEach(d => dispMap.set(d.id, d));
            const parentDispMap = new Map<number, any>();
            const isReset = phaseRequest?.reset_displacements || false;
            if (isReset && currentPhaseIdx > 0) {
                solverResult?.phases?.[currentPhaseIdx - 1]?.displacements.forEach(d => parentDispMap.set(d.id, d));
            }

            polygonGroups.forEach((elemIndices, polyId) => {
                const localValues = new Map<number, number>();
                const localWeights = new Map<number, number>();
                elemIndices.forEach(eIdx => {
                    const elem = mesh.elements[eIdx];
                    const s = stressMap.get(eIdx + 1);
                    if (outputType === OutputType.DEFORMED_CONTOUR) {
                        elem.forEach(nIdx => {
                            const d = dispMap.get(nIdx + 1);
                            let val = 0;
                            if (d) {
                                let dx = d.ux; let dy = d.uy;
                                if (isReset) {
                                    const pd = parentDispMap.get(d.id);
                                    if (pd) { dx -= pd.ux; dy -= pd.uy; }
                                }
                                val = Math.sqrt(dx * dx + dy * dy);
                            }
                            localValues.set(nIdx, (localValues.get(nIdx) || 0) + val);
                            localWeights.set(nIdx, (localWeights.get(nIdx) || 0) + 1);
                        });
                        currentLabel = "Displacement (m)";
                    } else if (s) {
                        const val = outputType === OutputType.YIELD_STATUS ? (s.is_yielded ? 1 : 0) : getStressValue(s);
                        if (outputType === OutputType.YIELD_STATUS) currentLabel = "Yield Status";
                        elem.forEach(nIdx => {
                            localValues.set(nIdx, (localValues.get(nIdx) || 0) + val);
                            localWeights.set(nIdx, (localWeights.get(nIdx) || 0) + 1);
                        });
                    }
                });
                localWeights.forEach((w, nIdx) => {
                    localValues.set(nIdx, (localValues.get(nIdx) || 0) / w);
                });
                groupNodeValues.set(polyId, localValues);
            });

            let min = Infinity, max = -Infinity;
            groupNodeValues.forEach((map) => {
                map.forEach((v) => {
                    if (v < min) min = v;
                    if (v > max) max = v;
                });
            });
            if (min === Infinity) { min = 0; max = 0; }
            if (min === max) max = min + 1e-9;

            const pos = new Float32Array(activeElementIndices.length * 4 * 3 * 3);
            const col = new Float32Array(activeElementIndices.length * 4 * 3 * 3);
            const wfPos = new Float32Array(activeElementIndices.length * 6 * 2 * 3);

            let vPtr = 0;
            let activeElemInOrderIdx = 0;
            polygonGroups.forEach((elemIndices, polyId) => {
                const localVals = groupNodeValues.get(polyId)!;
                elemIndices.forEach(eIdx => {
                    const elem = mesh.elements[eIdx];
                    const [n1, n2, n3, n12, n23, n31] = elem;

                    const tris = [[n1, n12, n31], [n12, n2, n23], [n23, n3, n31], [n12, n23, n31]];
                    tris.forEach(triNodes => {
                        triNodes.forEach(nIdx => {
                            const dPos = getDeformedPos(nIdx);
                            pos[vPtr * 3] = dPos[0]; pos[vPtr * 3 + 1] = dPos[1]; pos[vPtr * 3 + 2] = dPos[2];
                            const val = localVals.get(nIdx) || 0;
                            if (outputType === OutputType.YIELD_STATUS) {
                                if (val > 0.5) { col[vPtr * 3] = 1.0; col[vPtr * 3 + 1] = 0.2; col[vPtr * 3 + 2] = 0.2; }
                                else { col[vPtr * 3] = 0.2; col[vPtr * 3 + 1] = 0.8; col[vPtr * 3 + 2] = 0.2; }
                            } else {
                                const norm = (val - min) / (max - min);
                                const rgb = outputType === OutputType.DEFORMED_CONTOUR ? getJetColor(norm) : getStressColor(norm);
                                col[vPtr * 3] = rgb[0]; col[vPtr * 3 + 1] = rgb[1]; col[vPtr * 3 + 2] = rgb[2];
                            }
                            vPtr++;
                        });
                    });

                    const wfEdges = [[n1, n12], [n12, n2], [n2, n23], [n23, n3], [n3, n31], [n31, n1]];
                    wfEdges.forEach((edge, eInWfIdx) => {
                        const p1 = getDeformedPos(edge[0]); const p2 = getDeformedPos(edge[1]);
                        const baseIdx = (activeElemInOrderIdx * 6 + eInWfIdx) * 6;
                        wfPos[baseIdx] = p1[0]; wfPos[baseIdx + 1] = p1[1]; wfPos[baseIdx + 2] = p1[2];
                        wfPos[baseIdx + 3] = p2[0]; wfPos[baseIdx + 4] = p2[1]; wfPos[baseIdx + 5] = p2[2];
                    });
                    activeElemInOrderIdx++;
                });
            });

            return {
                positions: pos,
                indices: new Uint32Array(0),
                colors: col,
                wireframePositions: wfPos,
                rangeData: { min, max, label: currentLabel }
            };
        }
    }, [mesh, solverResult, currentPhaseIdx, phases, deformationScale, outputType, ignorePhases]);

    // Update range legend via effect
    React.useEffect(() => {
        onValueRangeChange(rangeData.min, rangeData.max, rangeData.label);
    }, [rangeData, onValueRangeChange]);

    if (!mesh) return null;

    return (
        <group>
            <mesh key={`solid-m-${currentPhaseIdx}-${outputType}`}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                    <bufferAttribute attach="attributes-color" args={[colors, 3]} />
                </bufferGeometry>
                <meshBasicMaterial
                    vertexColors={true}
                    transparent
                    opacity={0.7}
                    side={THREE.DoubleSide}
                    polygonOffset
                    polygonOffsetFactor={1}
                />
            </mesh>

            {wireframePositions && (
                <lineSegments key={`wire-m-${currentPhaseIdx}-${outputType}`}>
                    <bufferGeometry>
                        <bufferAttribute attach="attributes-position" args={[wireframePositions, 3]} />
                    </bufferGeometry>
                    <lineBasicMaterial color="#d4d4d4" transparent opacity={0.2} />
                </lineSegments>
            )}
        </group>
    );
};

const Polygon = ({ data }: PolygonProps) => {
    const { points } = useMemo(() => {
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
        <group onContextMenu={(e) => { e.nativeEvent.preventDefault(); e.stopPropagation(); }}>
            {/* Outline */}
            <Line points={points} color={"#fafafa"} lineWidth={2} />
        </group>
    );
};

const Legend = ({ min, max, label, visible, outputType }: { min: number, max: number, label: React.ReactNode, visible: boolean, outputType: OutputType }) => {
    if (!visible) return null;

    const formatValue = (val: number) => {
        if (Math.abs(val) < 0.001 && val !== 0) return val.toExponential(2);
        if (Math.abs(val) > 1000) return val.toFixed(0);
        return val.toFixed(3);
    };

    const isStressOrPwp = outputType !== OutputType.DEFORMED_CONTOUR;
    const gradient = isStressOrPwp
        ? 'linear-gradient(to right, #800000, #FF0000, #FFFF00, #00FFFF, #0000FF, #000080)'
        : 'linear-gradient(to right, #000080, #0000FF, #00FFFF, #FFFF00, #FF0000, #800000)';

    return (
        <div className="fixed bottom-5 right-0 left-0 mx-auto w-fit z-[50] items-center justify-center flex flex-col bg-slate-900/90 backdrop-blur-md p-4 rounded-xl border border-slate-700 shadow-2xl text-white z-[20]">
            <div className="text-xs font-semibold mb-2 tracking-widest">{label}</div>
            <div className="flex items-center gap-3">
                <div className="text-[10px] font-mono text-slate-400">{formatValue(min)}</div>
                <div className="w-32 h-3 rounded-full border border-white/20" style={{ background: gradient }}></div>
                <div className="text-[10px] font-mono text-slate-400">{formatValue(max)}</div>
            </div>
        </div>
    );
};

export const OutputCanvas: React.FC<OutputCanvasProps> = ({
    mesh,
    polygon,
    solverResult,
    currentPhaseIdx,
    phases,
    showControls = true,
    ignorePhases = false
}) => {
    const [sliderValue, setSliderValue] = useState(100);
    const [outputType, setOutputType] = useState<OutputType>(OutputType.DEFORMED_CONTOUR);
    const [range, setRange] = useState<{ min: number, max: number, label: React.ReactNode }>({ min: 0, max: 0, label: "" });
    const [showNodes, setShowNodes] = useState(false);
    const [showGaussPoints, setShowGaussPoints] = useState(false);

    const scale = outputType === OutputType.DEFORMED_MESH ? sliderValue : 0;

    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [solverResult?.log]);

    const handleRangeChange = React.useCallback((min: number, max: number, label: React.ReactNode) => {
        setRange({ min, max, label });
    }, []);

    return (
        <div className="w-full h-full bg-slate-900 absolute inset-0 overflow-hidden">
            {showControls && (
                <div className="absolute top-4 left-10 z-20 w-64 flex flex-col gap-4 max-h-[calc(100vh-32px)]">
                    {/* Control Panel */}
                    <div className="bg-slate-900/90 backdrop-blur-md p-5 rounded-xl border border-slate-700 shadow-2xl space-y-4 shrink-0">
                        <div>
                            <label className="block text-[10px] font-semibold text-slate-500 mb-2 tracking-widest uppercase">Output View</label>
                            <select
                                value={outputType}
                                onChange={(e) => setOutputType(e.target.value as OutputType)}
                                className="w-full bg-slate-800 border border-slate-700 text-slate-100 text-xs p-2 rounded outline-none focus:border-blue-500 transition-colors cursor-pointer"
                            >
                                <option value={OutputType.DEFORMED_MESH}>Deformed Mesh</option>
                                <option value={OutputType.DEFORMED_CONTOUR}>Deformed Contour</option>
                                <option value={OutputType.SIGMA_1}>Sigma 1 Major Total</option>
                                <option value={OutputType.SIGMA_3}>Sigma 3 Minor Total</option>
                                <option value={OutputType.SIGMA_1_EFF}>Sigma 1 Major Eff</option>
                                <option value={OutputType.SIGMA_3_EFF}>Sigma 3 Minor Eff</option>
                                <option value={OutputType.PWP_STEADY}>PWP Steady (Static)</option>
                                <option value={OutputType.PWP_EXCESS}>PWP Excess (Loading)</option>
                                <option value={OutputType.PWP_TOTAL}>PWP Total</option>
                                <option value={OutputType.YIELD_STATUS}>Yield Points</option>
                            </select>
                        </div>

                        {outputType === OutputType.DEFORMED_MESH && (
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-[10px] font-semibold text-slate-500 tracking-widest uppercase">Deformation Scale</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-mono bg-blue-500/10 px-1.5 py-0.5 rounded">
                                            {scale < 10 ? scale.toFixed(2) : scale.toFixed(0)}x
                                        </span>
                                        <button
                                            onClick={() => setSliderValue(10)}
                                            className="text-[10px] text-slate-400 hover:text-white transition-colors"
                                            title="Reset to 10x"
                                        >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    step="1"
                                    value={sliderValue}
                                    onChange={(e) => setSliderValue(Number(e.target.value))}
                                    className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                                />
                                <div className="flex justify-between mt-1 px-0.5">
                                    <span className="text-[8px]">1x</span>
                                    <span className="text-[8px]">50x</span>
                                    <span className="text-[8px]">100x</span>
                                </div>
                            </div>
                        )}

                        {/* Point Display Toggles */}
                        <div className="space-y-2 pt-2 border-t border-slate-700">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={showNodes}
                                    onChange={(e) => setShowNodes(e.target.checked)}
                                    className="w-3 h-3 accent-blue-500 cursor-pointer"
                                />
                                <span className="text-[10px] font-semibold text-slate-500 group-hover:text-slate-300 transition-colors tracking-widest">
                                    Show Nodes
                                </span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={showGaussPoints}
                                    onChange={(e) => setShowGaussPoints(e.target.checked)}
                                    className="w-3 h-3 accent-blue-500 cursor-pointer"
                                />
                                <span className="text-[10px] font-semibold text-slate-500 group-hover:text-slate-300 transition-colors tracking-widest">
                                    Show Gauss Points
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Log Panel */}
                    {solverResult && solverResult.log && (
                        <div className="bg-slate-900/90 backdrop-blur-md flex flex-col rounded-xl border border-slate-700 shadow-2xl overflow-hidden min-h-[150px] max-h-[calc(100vh-400px)] flex-1">
                            <div className="px-5 py-3 border-b border-slate-700 bg-slate-800/30">
                                <label className="block text-xs font-semibold text-slate-500 tracking-widest">Analysis Log Progress</label>
                            </div>
                            <div className="flex-1 overflow-y-auto p-5 font-mono text-[9px] text-slate-400 custom-scrollbar space-y-1">
                                {solverResult.log.map((line, i) => (
                                    <div key={i} className="leading-relaxed border-b border-slate-800/50 pb-1 last:border-0 hover:text-slate-200 transition-colors">
                                        {line}
                                    </div>
                                ))}
                                <div ref={logEndRef} />
                            </div>
                        </div>
                    )}
                </div>
            )}

            <Legend
                min={range.min}
                max={range.max}
                label={range.label}
                visible={showControls && outputType !== OutputType.DEFORMED_MESH}
                outputType={outputType}
            />

            <Canvas>
                <OrthographicCamera makeDefault position={[0, 0, 90]} zoom={40} />
                <OrbitControls enableRotate={false} />
                <Grid position={[0, 0, -1]} args={[100, 100]} cellColor="gray" sectionColor="#475569" fadeDistance={50} />

                {outputType !== OutputType.DEFORMED_MESH && (
                    polygon.map((poly, i) => {
                        return (
                            <Polygon
                                key={i}
                                data={poly}
                            />
                        );
                    })
                )}

                {mesh && (
                    <>
                        <MeshResult
                            mesh={mesh}
                            solverResult={solverResult}
                            currentPhaseIdx={currentPhaseIdx}
                            phases={phases}
                            deformationScale={scale}
                            outputType={outputType}
                            onValueRangeChange={handleRangeChange}
                            ignorePhases={ignorePhases}
                        />

                        {/* Render Nodes if enabled */}
                        {showNodes && outputType !== OutputType.DEFORMED_MESH && (
                            <>
                                {mesh.nodes.map((node, i) => (
                                    <mesh key={`node-${i}`} position={[node[0], node[1], 0.1]}>
                                        <circleGeometry args={[0.02, 16]} />
                                        <meshBasicMaterial color="#ffffff" />
                                    </mesh>
                                ))}
                            </>
                        )}

                        {/* Render Gauss Points if enabled */}
                        {showGaussPoints && outputType !== OutputType.DEFORMED_MESH && (
                            <>
                                {mesh.elements.map((elem, elemIdx) => {
                                    // 6-node element: [n1, n2, n3, n4, n5, n6]
                                    // n4 is mid 1-2, n5 is mid 2-3, n6 is mid 3-1
                                    const nodes = elem.map(idx => mesh.nodes[idx]);

                                    // Find stress results for this element
                                    // Optimization: This search is O(N_results), could be slow for huge info. 
                                    // Better to assume sorted or use map. For now simple find.
                                    const phaseRes = solverResult?.phases[currentPhaseIdx];
                                    if (!phaseRes) return null;

                                    // 3-point Gauss quadrature (Natural coords)
                                    const gaussPoints = [
                                        { xi: 1 / 6, eta: 1 / 6, id: 1 },
                                        { xi: 2 / 3, eta: 1 / 6, id: 2 },
                                        { xi: 1 / 6, eta: 2 / 3, id: 3 }
                                    ];

                                    return gaussPoints.map((gp, gpIdx) => {
                                        const { xi, eta } = gp;
                                        const zeta = 1 - xi - eta;

                                        // T6 Shape Functions
                                        const N1 = zeta * (2 * zeta - 1);
                                        const N2 = xi * (2 * xi - 1);
                                        const N3 = eta * (2 * eta - 1);
                                        const N4 = 4 * zeta * xi;
                                        const N5 = 4 * xi * eta;
                                        const N6 = 4 * eta * zeta;

                                        const N = [N1, N2, N3, N4, N5, N6];

                                        let x = 0, y = 0;
                                        for (let i = 0; i < 6; i++) {
                                            if (nodes[i]) {
                                                x += N[i] * nodes[i][0];
                                                y += N[i] * nodes[i][1];
                                            }
                                        }
                                        let color = "#ffffff"; // Default green

                                        return (
                                            <mesh key={`gauss-${elemIdx}-${gpIdx}`} position={[x, y, 0.1]}>
                                                <circleGeometry args={[0.02, 8]} />
                                                <meshBasicMaterial color={color} />
                                            </mesh>
                                        );
                                    });
                                })}
                            </>
                        )}
                    </>
                )}
            </Canvas>
        </div>
    );
};
