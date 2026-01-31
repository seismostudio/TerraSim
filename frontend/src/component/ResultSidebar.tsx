import React from 'react';
import { SolverResponse, PhaseRequest, StepPoint, PhaseType } from '../types';
import { ChevronDown, CircleCheck, CircleMinus } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const PhaseChart = ({ points, isLive = false, isSafety = false }: { points: StepPoint[], isLive?: boolean, isSafety?: boolean }) => {
    if (!points || points.length < 2) return null;

    const [isExpanded, setIsExpanded] = React.useState(false);

    const chart = (
        <>
            <div className="h-40 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points} margin={{ top: 5, right: 10, bottom: 2, left: -20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" />
                        <XAxis
                            dataKey="max_disp"
                            type="number"
                            domain={['auto', 'auto']}
                            fontSize={8}
                            stroke="#ffffff"
                            tickFormatter={(v) => typeof v === 'number' ? v.toPrecision(2) : v}
                            label={{ value: 'Disp (m)', position: 'insideBottom', offset: 5, fontSize: 8, fill: '#ffffff' }}
                        />
                        <YAxis
                            dataKey="m_stage"
                            domain={[0, 'auto']}
                            fontSize={8}
                            stroke="#ffffff"
                            label={{ value: isSafety ? 'Σ Msf' : 'Mstage', angle: -90, position: 'insideLeft', offset: 25, fontSize: 8, fill: '#ffffff' }}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '9px' }}
                            itemStyle={{ color: isLive ? '#60a5fa' : '#4ade80' }}
                            labelStyle={{ color: '#94a3b8' }}
                            formatter={(value: any) => [typeof value === 'number' ? value.toPrecision(4) : value, 'Value']}
                            labelFormatter={(value: any) => `Disp: ${typeof value === 'number' ? value.toPrecision(4) : value} m`}
                        />
                        <Line
                            type="monotone"
                            dataKey="m_stage"
                            stroke={isLive ? "#3b82f6" : "#22c55e"}
                            strokeWidth={2}
                            dot={{ r: 2, fill: isLive ? "#3b82f6" : "#22c55e", strokeWidth: 0 }}
                            activeDot={{ r: 4, stroke: '#fff', strokeWidth: 1 }}
                            isAnimationActive={false}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </>
    )

    return (
        <div className="mt-2 bg-slate-800/50 rounded-lg border border-slate-700 animate-in fade-in zoom-in-95 duration-300">

            {isLive ? (
                <>
                    <div className="text-xs font-semibold py-2 tracking-widest text-center">
                        {isLive ? <span className="text-blue-400 animate-pulse">Running </span> : ''}
                        {isSafety ? 'Msf' : 'Mstage'} vs. Disp.
                    </div>
                    {chart}
                </>
            ) : (
                <>
                    <div className="w-full relative text-xs font-semibold py-2 tracking-widest text-center">
                        {isSafety ? 'Msf' : 'Mstage'} vs. Disp.
                        <button onClick={() => setIsExpanded(!isExpanded)} className="absolute right-2 text-slate-500 hover:text-white transition-colors">
                            <ChevronDown size={12} className={`transition ${isExpanded ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                    {isExpanded && (

                        <div className="h-40 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={points} margin={{ top: 5, right: 10, bottom: 2, left: -20 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#ffffff" />
                                    <XAxis
                                        dataKey="max_disp"
                                        type="number"
                                        domain={['auto', 'auto']}
                                        fontSize={8}
                                        stroke="#ffffff"
                                        tickFormatter={(v) => typeof v === 'number' ? v.toPrecision(2) : v}
                                        label={{ value: 'Disp (m)', position: 'insideBottom', offset: 5, fontSize: 8, fill: '#ffffff' }}
                                    />
                                    <YAxis
                                        dataKey="m_stage"
                                        domain={[0, 'auto']}
                                        fontSize={8}
                                        stroke="#ffffff"
                                        label={{ value: isSafety ? 'Σ Msf' : 'Mstage', angle: -90, position: 'insideLeft', offset: 25, fontSize: 8, fill: '#ffffff' }}
                                    />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px', fontSize: '9px' }}
                                        itemStyle={{ color: isLive ? '#60a5fa' : '#4ade80' }}
                                        labelStyle={{ color: '#94a3b8' }}
                                        formatter={(value: any) => [typeof value === 'number' ? value.toPrecision(4) : value, 'Value']}
                                        labelFormatter={(value: any) => `Disp: ${typeof value === 'number' ? value.toPrecision(4) : value} m`}
                                    />
                                    <Line
                                        type="monotone"
                                        dataKey="m_stage"
                                        stroke={isLive ? "#3b82f6" : "#22c55e"}
                                        strokeWidth={2}
                                        dot={{ r: 2, fill: isLive ? "#3b82f6" : "#22c55e", strokeWidth: 0 }}
                                        activeDot={{ r: 4, stroke: '#fff', strokeWidth: 1 }}
                                        isAnimationActive={false}
                                    />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};


const ResultSummary = ({ phaseResult }: { phaseResult: any }) => {
    if (!phaseResult) return null;

    const dispMags = phaseResult.displacements.map((d: any) => Math.sqrt(d.ux * d.ux + d.uy * d.uy));
    const maxDisp = Math.max(...dispMags);
    const minDisp = Math.min(...dispMags);

    const stresses = phaseResult.stresses.map((s: any) => {
        const avg = (s.sig_xx + s.sig_yy) / 2;
        const diff = (s.sig_xx - s.sig_yy) / 2;
        const radius = Math.sqrt(diff * diff + s.sig_xy * s.sig_xy);

        // Geotechnical Convention: Sigma 1 is Major (Most Compressive/Negative), Sigma 3 is Minor (Least Compressive/Negative)
        const s1 = avg - radius;
        const s3 = avg + radius;

        const pwp = s.pwp || 0;
        const s1e = s1 - pwp;
        const s3e = s3 - pwp;

        return { s1, s3, s1e, s3e, pwp, yielded: s.is_yielded };
    });

    const metrics = {
        maxS1: Math.max(...stresses.map((s: any) => s.s1)),
        minS1: Math.min(...stresses.map((s: any) => s.s1)),
        maxS3: Math.max(...stresses.map((s: any) => s.s3)),
        minS3: Math.min(...stresses.map((s: any) => s.s3)),
        maxS1e: Math.max(...stresses.map((s: any) => s.s1e)),
        minS1e: Math.min(...stresses.map((s: any) => s.s1e)),
        maxS3e: Math.max(...stresses.map((s: any) => s.s3e)),
        minS3e: Math.min(...stresses.map((s: any) => s.s3e)),
        maxPWP: Math.max(...stresses.map((s: any) => s.pwp)),
        minPWP: Math.min(...stresses.map((s: any) => s.pwp)),
        yieldCount: stresses.filter((s: any) => s.yielded).length
    };

    const Row = ({ label, min, max, unit = "kN/m²" }: any) => (
        <div className="py-2 border-b border-slate-700">
            <div className="text-[10px] text-slate-300 font-semibold mb-1 tracking-widest">{label} </div>
            <div className="flex justify-between items-end">
                <div className="flex flex-col">
                    <span className="text-[9px] text-slate-500">Min</span>
                    <span className="text-xs font-mono text-rose-400">{min.toPrecision(4)} {unit}</span>
                </div>
                <div className="flex flex-col text-right">
                    <span className="text-[9px] text-slate-500">Max</span>
                    <span className="text-xs font-mono text-emerald-400">{max.toPrecision(4)} {unit}</span>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-1">
            {!phaseResult.success && (
                <div className="mb-4 p-3 bg-rose-500/20 border border-rose-500/50 rounded-xl">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-[11px] font-semibold text-rose-200 tracking-widest">Phase Failed</span>
                    </div>
                    <p className="text-[10px] text-rose-300 leading-relaxed italic">
                        Failed at step {phaseResult.step_failed_at} with mStage {phaseResult.reached_m_stage?.toFixed(3)}.
                        Showing last converged state.
                    </p>
                </div>
            )}

            <Row label="Displacement" min={minDisp} max={maxDisp} unit="m" />
            <Row label="Sigma 1 Major (Total)" min={metrics.minS1} max={metrics.maxS1} />
            <Row label="Sigma 3 Minor (Total)" min={metrics.minS3} max={metrics.maxS3} />
            <Row label="Sigma 1 Major (Effective)" min={metrics.minS1e} max={metrics.maxS1e} />
            <Row label="Sigma 3 Minor (Effective)" min={metrics.minS3e} max={metrics.maxS3e} />
            <Row label="Pore Water Pressure" min={metrics.minPWP} max={metrics.maxPWP} />

            <div className={`mt-2 p-4 rounded-xl border ${metrics.yieldCount > 0 ? 'bg-rose-500/10 border-rose-500/20' : 'bg-blue-500/10 border-blue-500/20'}`}>
                <div className={`text-sm font-semibold flex items-baseline gap-2 ${metrics.yieldCount > 0 ? 'text-rose-500' : 'text-blue-500'}`}>
                    {metrics.yieldCount}
                    <span className="text-xs font-normal text-slate-400 truncate">points yielded</span>
                </div>
            </div>
        </div>
    );
};

interface ResultSidebarProps {
    solverResult: SolverResponse | null;
    isRunning: boolean;
    onRun: () => void;
    onCancel: () => void;
    phases: PhaseRequest[];
    currentPhaseIdx: number;
    onSelectPhase: (idx: number) => void;
    liveStepPoints?: StepPoint[]; // NEW
}

export const ResultSidebar: React.FC<ResultSidebarProps> = ({
    solverResult, isRunning, onRun, onCancel, phases, currentPhaseIdx, onSelectPhase, liveStepPoints = []
}) => {
    return (
        <div className="absolute top-4 right-4 bottom-4 w-72 bg-slate-900/95 backdrop-blur-md border border-slate-700 rounded-2xl shadow-2xl flex flex-col z-20 overflow-hidden">
            <div className="p-5 border-b border-slate-800 bg-slate-800/20">
                <button
                    onClick={onRun}
                    disabled={isRunning}
                    className={`cursor-pointer w-full py-3 rounded-xl font-bold text-xs uppercase tracking-widest transition-all shadow-lg ${isRunning
                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-500/20 hover:scale-[1.02]'
                        }`}
                >
                    {isRunning ? (
                        <span className="flex items-center justify-center gap-2">
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Solving...
                        </span>
                    ) : 'Run Analysis'}
                </button>

                {isRunning && (
                    <button
                        onClick={onCancel}
                        className="cursor-pointer w-full mt-3 py-2 rounded-xl font-bold text-[10px] uppercase tracking-widest transition-all bg-rose-500/10 border border-rose-500/50 text-rose-400 hover:bg-rose-500/20"
                    >
                        Cancel Analysis
                    </button>
                )}
                {isRunning && (
                    <PhaseChart
                        points={liveStepPoints}
                        isLive={true}
                        isSafety={phases[currentPhaseIdx]?.phase_type === PhaseType.SAFETY_ANALYSIS}
                    />
                )}
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
                {solverResult && (
                    <>
                        <div className="space-y-2">
                            {solverResult.phases[currentPhaseIdx]?.step_points && (
                                <PhaseChart
                                    points={solverResult.phases[currentPhaseIdx].step_points!}
                                    isSafety={phases[currentPhaseIdx]?.phase_type === PhaseType.SAFETY_ANALYSIS}
                                />
                            )}

                            <label className="text-xs font-semibold text-slate-500 tracking-widest">Select Phase</label>
                            <div className="grid grid-cols-1 gap-1">
                                {phases.map((p, idx) => {
                                    const result = solverResult.phases[idx];
                                    const isFailed = result && !result.success;
                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => onSelectPhase(idx)}
                                            className={`cursor-pointer px-3 py-2 text-left text-xs rounded-lg border transition-all truncate flex items-center justify-between gap-2 ${currentPhaseIdx === idx
                                                ? (isFailed ? 'bg-rose-600/10 border-rose-500/50 text-rose-400 font-bold' : 'bg-blue-600/10 border-blue-500/50 text-blue-400 font-bold')
                                                : 'bg-slate-800/40 border-slate-700/50 text-slate-400 hover:bg-slate-800/60'
                                                }`}
                                        >
                                            <span className="truncate">{idx}. {p.name}</span>
                                            {result && (
                                                result.success ? (
                                                    <CircleCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                                                ) : (
                                                    <CircleMinus className="w-3.5 h-3.5 text-rose-500 flex-shrink-0" />
                                                )
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="border-t border-slate-800">
                            <ResultSummary phaseResult={solverResult.phases[currentPhaseIdx]} />
                        </div>
                    </>
                )}

                {!solverResult && !isRunning && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-2 space-y-2">
                        <p className="text-xs text-slate-500 leading-relaxed">No analysis data available. Click "Run Analysis" to start the analysis.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
