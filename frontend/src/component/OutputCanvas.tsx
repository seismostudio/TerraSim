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
    const { positions, indices, colors, rangeData } = useMemo(() => {
        if (!mesh) return {
            positions: new Float32Array(0),
            indices: new Uint32Array(0),
            colors: new Float32Array(0),
            rangeData: { min: 0, max: 0, label: "" }
        };

        const phaseResult = solverResult?.phases?.[currentPhaseIdx];
        const phaseRequest = phases[currentPhaseIdx];
        const activePolygons = new Set(phaseRequest?.active_polygon_indices || []);

        const isSolidMaterial = outputType === OutputType.DEFORMED_MESH;

        // Find active elements
        const activeElementIndices: number[] = [];
        mesh.elements.forEach((e, i) => {
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
            // Non-indexed geometry for solid fill
            const pos = new Float32Array(activeElementIndices.length * 3 * 3);
            const col = new Float32Array(activeElementIndices.length * 3 * 3);

            activeElementIndices.forEach((elemIdx, i) => {
                const elem = mesh.elements[elemIdx];
                const mat = mesh.element_materials[elemIdx]?.material;
                const mColor = mat?.color ? new THREE.Color(mat.color) : new THREE.Color(0.23, 0.51, 0.96);

                elem.forEach((nIdx, vIdx) => {
                    const dPos = getDeformedPos(nIdx);
                    const baseIdx = (i * 3 + vIdx) * 3;
                    pos[baseIdx] = dPos[0];
                    pos[baseIdx + 1] = dPos[1];
                    pos[baseIdx + 2] = dPos[2];

                    col[baseIdx] = mColor.r;
                    col[baseIdx + 1] = mColor.g;
                    col[baseIdx + 2] = mColor.b;
                });
            });

            return {
                positions: pos,
                indices: new Uint32Array(0), // No indices for non-indexed geometry
                colors: col,
                rangeData: { min: 0, max: 0, label: "" }
            };
        } else {
            // Indexed geometry for smooth contours
            const nodeCount = mesh.nodes.length;
            const pos = new Float32Array(nodeCount * 3);
            const col = new Float32Array(nodeCount * 3);
            const ind: number[] = [];

            // Node Values Mapping (for Stress/Contour)
            const nodeValues = new Float32Array(nodeCount).fill(0);
            const nodeWeights = new Float32Array(nodeCount).fill(0);
            let currentLabel: React.ReactNode = "";

            if (outputType === OutputType.DEFORMED_CONTOUR) {
                if (phaseResult) {
                    phaseResult.displacements.forEach((d) => {
                        const resetVisual = phaseRequest?.reset_displacements || false;
                        const parentPhaseResult = currentPhaseIdx > 0 ? solverResult?.phases?.[currentPhaseIdx - 1] : null;
                        let dx = d.ux;
                        let dy = d.uy;
                        if (resetVisual && parentPhaseResult) {
                            const pd = parentPhaseResult.displacements.find(p => p.id === d.id);
                            if (pd) { dx -= pd.ux; dy -= pd.uy; }
                        }
                        nodeValues[d.id - 1] = Math.sqrt(dx * dx + dy * dy);
                    });
                }
                currentLabel = "Displacement (m)";
            } else if (phaseResult && phaseResult.stresses.length > 0) {
                phaseResult.stresses.forEach(s => {
                    let val = 0;
                    const elem = mesh.elements[s.element_id - 1];
                    const pwp = s.pwp || 0;

                    if (outputType === OutputType.PWP) {
                        val = pwp;
                        currentLabel = <span className="flex items-center gap-1">PWP Steady State <MathRender tex="(kN/m^2)" /></span>;
                    } else if (outputType === OutputType.SIGMA_1 || outputType === OutputType.SIGMA_3) {
                        const avg = (s.sig_xx + s.sig_yy) / 2;
                        const diff = (s.sig_xx - s.sig_yy) / 2;
                        const radius = Math.sqrt(diff * diff + s.sig_xy * s.sig_xy);
                        val = outputType === OutputType.SIGMA_1 ? avg - radius : avg + radius;
                        currentLabel = outputType === OutputType.SIGMA_1 ?
                            <span className="flex items-center gap-1"><MathRender tex="\sigma_1" /> Principal Total Stress <MathRender tex="(kN/m^2)" /></span> :
                            <span className="flex items-center gap-1"><MathRender tex="\sigma_3" /> Principal Total Stress <MathRender tex="(kN/m^2)" /></span>;
                    } else if (outputType === OutputType.SIGMA_1_EFF || outputType === OutputType.SIGMA_3_EFF) {
                        const sxx_eff = s.sig_xx - pwp;
                        const syy_eff = s.sig_yy - pwp;
                        const avg = (sxx_eff + syy_eff) / 2;
                        const diff = (sxx_eff - syy_eff) / 2;
                        const radius = Math.sqrt(diff * diff + s.sig_xy * s.sig_xy);
                        val = outputType === OutputType.SIGMA_1_EFF ? avg - radius : avg + radius;
                        currentLabel = outputType === OutputType.SIGMA_1_EFF ?
                            <span className="flex items-center gap-1"><MathRender tex="\sigma'_1" /> Principal Effective Stress <MathRender tex="(kN/m^2)" /></span> :
                            <span className="flex items-center gap-1"><MathRender tex="\sigma'_3" /> Principal Effective Stress <MathRender tex="(kN/m^2)" /></span>;
                    } else if (outputType === OutputType.YIELD_STATUS) {
                        val = s.is_yielded ? 1 : 0;
                        currentLabel = "Yield Status";
                    }

                    if (elem) {
                        elem.forEach(nIdx => {
                            nodeValues[nIdx] += val;
                            nodeWeights[nIdx] += 1;
                        });
                    }
                });

                for (let i = 0; i < nodeCount; i++) {
                    if (nodeWeights[i] > 0) nodeValues[i] /= nodeWeights[i];
                }
            }

            // Ranges
            const activeNodes = new Set<number>();
            activeElementIndices.forEach(idx => {
                mesh.elements[idx].forEach(nIdx => activeNodes.add(nIdx));
            });

            let min = Infinity, max = -Infinity;
            activeNodes.forEach(nIdx => {
                const v = nodeValues[nIdx];
                if (v < min) min = v;
                if (v > max) max = v;
            });
            if (min === Infinity) { min = 0; max = 0; }
            if (min === max) max = min + 1e-9;

            // Build Buffer
            for (let i = 0; i < nodeCount; i++) {
                const dPos = getDeformedPos(i);
                pos[i * 3] = dPos[0];
                pos[i * 3 + 1] = dPos[1];
                pos[i * 3 + 2] = dPos[2];

                if (outputType === OutputType.YIELD_STATUS) {
                    if (nodeValues[i] > 0.5) {
                        col[i * 3] = 1.0; col[i * 3 + 1] = 0.2; col[i * 3 + 2] = 0.2;
                    } else {
                        col[i * 3] = 0.2; col[i * 3 + 1] = 0.8; col[i * 3 + 2] = 0.2;
                    }
                } else {
                    const normalized = (nodeValues[i] - min) / (max - min);
                    const isStressOrPwp = outputType !== OutputType.DEFORMED_CONTOUR;
                    const [r, g, b] = isStressOrPwp ? getStressColor(normalized) : getJetColor(normalized);
                    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
                }
            }

            activeElementIndices.forEach(idx => {
                const e = mesh.elements[idx];
                ind.push(e[0], e[1], e[2]);
            });

            return {
                positions: pos,
                indices: new Uint32Array(ind),
                colors: col,
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
            {/* Solid Mesh (Colors/Contours) */}
            <mesh key={`solid-m-${currentPhaseIdx}-${outputType}-${mesh.nodes.length}-${mesh.elements.length}`}>
                <bufferGeometry key={`solid-g-${currentPhaseIdx}-${outputType}-${mesh.nodes.length}-${mesh.elements.length}`}>
                    <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                    <bufferAttribute attach="attributes-color" args={[colors, 3]} />
                    {indices.length > 0 && <bufferAttribute attach="index" args={[indices, 1]} />}
                </bufferGeometry>
                <meshBasicMaterial
                    vertexColors={true}
                    color={"white"}
                    opacity={0.7}
                    transparent
                    side={THREE.DoubleSide}
                    polygonOffset
                    polygonOffsetFactor={1}
                    polygonOffsetUnits={1}
                />
            </mesh>

            {/* Wireframe Mesh (Lines) */}
            <mesh key={`wire-m-${currentPhaseIdx}-${outputType}-${mesh.nodes.length}-${mesh.elements.length}`}>
                <bufferGeometry key={`wire-g-${currentPhaseIdx}-${outputType}-${mesh.nodes.length}-${mesh.elements.length}`}>
                    <bufferAttribute attach="attributes-position" args={[positions, 3]} />
                    {indices.length > 0 && <bufferAttribute attach="index" args={[indices, 1]} />}
                </bufferGeometry>
                <meshBasicMaterial
                    color="#d4d4d4"
                    wireframe={true}
                    transparent={true}
                    opacity={0.8}
                    depthTest={true}
                    depthWrite={false}
                />
            </mesh>
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
    const [sliderValue, setSliderValue] = useState(200); // Default to roughly 1x if mapping 0-1000
    const [outputType, setOutputType] = useState<OutputType>(OutputType.DEFORMED_CONTOUR);
    const [range, setRange] = useState<{ min: number, max: number, label: React.ReactNode }>({ min: 0, max: 0, label: "" });

    // Logarithmic mapping: Slider 0-1000 -> Scale 10^-1 (0.1) to 10^4 (10000)
    const minLog = -1;
    const maxLog = 4;
    const scale = Math.pow(10, (sliderValue / 1000) * (maxLog - minLog) + minLog);

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
                <div className="absolute top-4 left-4 z-20 w-64 flex flex-col gap-4 max-h-[calc(100vh-32px)]">
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
                                <option value={OutputType.PWP}>Pore Water Pressure</option>
                                <option value={OutputType.YIELD_STATUS}>Yield Points</option>
                            </select>
                        </div>

                        <div>
                            <div className="flex justify-between items-center mb-2">
                                <label className="text-[10px] font-semibold text-slate-500 tracking-widest uppercase">Deformation Scale</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-mono bg-blue-500/10 px-1.5 py-0.5 rounded">
                                        {scale < 10 ? scale.toFixed(2) : scale.toFixed(0)}x
                                    </span>
                                    <button
                                        onClick={() => setSliderValue(200)}
                                        className="text-[10px] text-slate-400 hover:text-white transition-colors"
                                        title="Reset to 1x"
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
                                max="1000"
                                step="1"
                                value={outputType === OutputType.DEFORMED_MESH ? sliderValue : 0}
                                disabled={outputType !== OutputType.DEFORMED_MESH}
                                onChange={(e) => setSliderValue(Number(e.target.value))}
                                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
                            />
                            <div className="flex justify-between mt-1 px-0.5">
                                <span className="text-[8px]">0.1x</span>
                                <span className="text-[8px]">2x</span>
                                <span className="text-[8px]">32x</span>
                            </div>
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
                    </>
                )}
            </Canvas>
        </div>
    );
};
