import React from 'react';
import { Settings, Folder, Square, ArrowDownToDot, Pen, ChartNoAxesColumnIncreasing, ChartNoAxesColumnDecreasing } from 'lucide-react';

export enum WizardTab {
    INPUT = 'INPUT',
    MESH = 'MESH',
    STAGING = 'STAGING',
    RESULT = 'RESULT'
}

interface WizardHeaderProps {
    activeTab: WizardTab;
    onTabChange: (tab: WizardTab) => void;
    drawMode: string | null;
    onDrawModeChange: (mode: string | null) => void;
    onOpenSettings: () => void;
}

export const WizardHeader: React.FC<WizardHeaderProps> = ({
    activeTab,
    onTabChange,
    drawMode,
    onDrawModeChange,
    onOpenSettings
}) => {
    const tabs = [
        { id: WizardTab.INPUT, label: 'Input' },
        { id: WizardTab.MESH, label: 'Mesh' },
        { id: WizardTab.STAGING, label: 'Staging' },
        { id: WizardTab.RESULT, label: 'Result' },
    ];

    return (
        <div className="flex flex-col bg-slate-800 border-b border-slate-700 z-50">
            <header className="flex items-center justify-between p-2 border-b border-slate-700 h-16">
                <div className="flex items-center gap-2">
                    <img src="/Logo.png" alt="Logo" className="w-10 h-10" />
                    <div className="flex flex-col gap-1">
                        <h1 className="text-xl font-bold text-white tracking-tight leading-none">TerraSim</h1>
                        <p className="text-[11px] text-slate-500 font-semibold transition-colors">v 0.1.0 | Geotechnical FEA Software Analysis</p>
                    </div>
                </div>

                <button
                    onClick={onOpenSettings}
                    className="p-2.5 rounded-xl hover:bg-slate-700/50 transition-all text-slate-400 hover:text-blue-400 group relative active:scale-95"
                    title="Global Settings"
                >
                    <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform duration-300" />
                </button>
            </header>
            <div className="flex gap-2 mt-2 pl-2">
                {tabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`cursor-pointer py-2 px-2 text-sm transition-all border-b-2 h-full ${isActive
                                ? 'text-blue-500 border-blue-500 font-bold bg-blue-600/20 rounded-t-lg'
                                : 'text-slate-400 border-transparent hover:text-slate-300'
                                }`}
                            title={tab.label}
                        >
                            {tab.label}
                        </button>
                    );
                })}
                {activeTab === WizardTab.INPUT && (
                    <div className="flex items-center gap-2 border-l pl-2 border-slate-700">
                        <button
                            onClick={() => onDrawModeChange(drawMode === 'polygon' ? null : 'polygon')}
                            className={`cursor-pointer w-10 relative  py-2 px-2 text-sm transition-all border-b-2 h-full ${drawMode === 'polygon' ? 'text-blue-500 border-blue-500 font-bold rounded-t-lg bg-blue-600/20' : 'text-slate-400 border-transparent hover:text-slate-300'}`}
                        >
                            <Folder/>
                            <Pen className='absolute top-1 right-1 w-4 h-4'/>
                        </button>
                        <button
                            onClick={() => onDrawModeChange(drawMode === 'rectangle' ? null : 'rectangle')}
                            className={`cursor-pointer w-10 relative py-2 px-2 text-sm transition-all border-b-2 h-full ${drawMode === 'rectangle' ? 'text-blue-500 border-blue-500 font-bold rounded-t-lg bg-blue-600/20' : 'text-slate-400 border-transparent hover:text-slate-300'}`}
                        >
                            <Square/>
                            <Pen className='absolute top-1 right-1 w-4 h-4'/>
                        </button>
                        <button
                            onClick={() => onDrawModeChange(drawMode === 'point_load' ? null : 'point_load')}
                            className={`cursor-pointer w-10 relative py-2 px-2 text-sm transition-all border-b-2 h-full ${drawMode === 'point_load' ? 'text-blue-500 border-blue-500 font-bold rounded-t-lg bg-blue-600/20' : 'text-slate-400 border-transparent hover:text-slate-300'}`}
                        >
                            <ArrowDownToDot/>
                        </button>
                        <button
                            onClick={() => onDrawModeChange(drawMode === 'water_level' ? null : 'water_level')}
                            className={`cursor-pointer w-10 relative py-2 px-2 text-sm transition-all border-b-2 h-full ${drawMode === 'water_level' ? 'text-blue-500 border-blue-500 font-bold rounded-t-lg bg-blue-600/20' : 'text-slate-400 border-transparent hover:text-slate-300'}`}
                        >
                            <ChartNoAxesColumnIncreasing className='absolute bottom-2.5 left-1 w-5 h-5 -rotate-90'/>
                            <ChartNoAxesColumnDecreasing className='absolute bottom-2.5 right-1 w-5 h-5 rotate-90'/>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
