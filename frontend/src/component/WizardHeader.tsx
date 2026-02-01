import { Settings, Folder, Square, ArrowDownToDot, Pen, ChartNoAxesColumnIncreasing, ChartNoAxesColumnDecreasing, LogOut, ArrowDown, Bell, Calendar, ChevronRight, Save, FolderOpen, ArrowDownToLine, CloudUpload, CloudDownload, Loader2, Book } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { SOFTWARE_UPDATES } from '../data/updates';
import { useAuth } from '../context/AuthContext';
import { ProjectMetadata } from '../types';

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
    onImportDXF?: (file: File) => void;
    projectName: string;
    setProjectName: (name: string) => void;
    projectMetadata: ProjectMetadata | null;
    onSaveProject: () => void;
    onLoadProject: (file: File) => void;
    onCloudSave: () => void;
    onCloudLoad: () => void;
    isCloudSaving: boolean;
}

export const WizardHeader: React.FC<WizardHeaderProps> = ({
    activeTab,
    onTabChange,
    drawMode,
    onDrawModeChange,
    onOpenSettings,
    onImportDXF,
    projectName,
    setProjectName,
    projectMetadata,
    onSaveProject,
    onLoadProject,
    onCloudSave,
    onCloudLoad,
    isCloudSaving
}) => {
    const { user, logout } = useAuth();
    const [isUpdateOpen, setIsUpdateOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsUpdateOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const tabs = [
        { id: WizardTab.INPUT, label: 'Input' },
        { id: WizardTab.MESH, label: 'Mesh' },
        { id: WizardTab.STAGING, label: 'Staging' },
        { id: WizardTab.RESULT, label: 'Result' },
    ];

    return (
        <div className="flex flex-col bg-slate-800 border-b border-slate-700 z-50">
            <header className="flex items-center justify-between px-4 py-2 border-b border-slate-700 h-16">
                <div className="flex items-center gap-2">
                    <img src="/Logo.png" alt="Logo" className="w-8 h-8" />
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-white tracking-tight leading-none">TerraSim (Beta)</h1>
                            <span className="text-slate-600">|</span>
                            <input
                                type="text"
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                className="bg-transparent border-none text-sm font-semibold text-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded px-1 w-48"
                                placeholder="Project Name"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <p className="text-[11px] text-slate-500 font-semibold transition-colors">v 0.2.1 | Geotechnical FEA Software Analysis</p>
                            {projectMetadata && (
                                <>
                                    <span className="text-[10px] text-slate-400 border-l border-slate-700 pl-2">
                                        Last edited {new Date(projectMetadata.lastEdited).toLocaleDateString()} by {projectMetadata.authorName || 'Unknown'}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    {user && (
                        <div className="flex items-center gap-3 px-3 py-1.5">
                            <div className="flex flex-col items-end">
                                <span className="text-xs font-semibold text-slate-300 leading-none">Welcome, {user.name}</span>
                            </div>
                        </div>
                    )}

                    <div className="relative" ref={dropdownRef}>
                        <div className="flex items-center gap-1 mr-2 border-r border-slate-700 pr-2">
                            <button
                                onClick={onSaveProject}
                                className="cursor-pointer p-2.5 rounded-xl transition-all group relative active:scale-95 text-slate-400 hover:bg-slate-700/50 hover:text-blue-400"
                                title="Save Project"
                            >
                                <Save className="w-5 h-5" />
                            </button>
                            <button
                                onClick={onCloudSave}
                                disabled={isCloudSaving}
                                className="cursor-pointer p-2.5 rounded-xl transition-all group relative active:scale-95 text-slate-400 hover:bg-slate-700/50 hover:text-blue-400 disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Save Project on Cloud"
                            >
                                {isCloudSaving ? (
                                    <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                                ) : (
                                    <CloudUpload className="w-5 h-5" />
                                )}
                            </button>
                            <button
                                onClick={onCloudLoad}
                                className="cursor-pointer p-2.5 rounded-xl transition-all group relative active:scale-95 text-slate-400 hover:bg-slate-700/50 hover:text-blue-400"
                                title="Load Project from Cloud"
                            >
                                <CloudDownload className="w-5 h-5" />
                            </button>
                            <label
                                className="cursor-pointer p-2.5 rounded-xl transition-all group relative active:scale-95 text-slate-400 hover:bg-slate-700/50 hover:text-blue-400"
                                title="Open Project"
                            >
                                <input
                                    type="file"
                                    accept=".tsm"
                                    className="hidden"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            onLoadProject(file);
                                            e.target.value = '';
                                        }
                                    }}
                                />
                                <FolderOpen className="w-5 h-5" />
                            </label>
                        </div>

                        {isUpdateOpen && (
                            <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl overflow-hidden z-[100] animate-in fade-in zoom-in duration-200">
                                <div className="p-4 border-b border-slate-700 bg-slate-800/50">
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        Software Updates
                                    </h3>
                                </div>
                                <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                                    {SOFTWARE_UPDATES.map((update, index) => (
                                        <div key={index} className="p-4 border-b border-slate-800 last:border-0 hover:bg-slate-800/30 transition-colors">
                                            <div className="flex justify-between items-start mb-2">
                                                <span className="text-xs font-semibold text-blue-400 bg-blue-400/10 px-2 py-0.5 rounded-full">{update.version}</span>
                                                <div className="flex items-center gap-1 text-[10px] text-slate-500">
                                                    <Calendar className="w-3 h-3" />
                                                    {update.date}
                                                </div>
                                            </div>
                                            <ul className="space-y-1.5">
                                                {update.changes.map((change, cIndex) => (
                                                    <li key={cIndex} className="text-[11px] text-slate-300 flex items-start gap-2">
                                                        <ChevronRight className="w-3 h-3 mt-0.5 text-slate-500 shrink-0" />
                                                        <span>{change}</span>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={() => setIsUpdateOpen(!isUpdateOpen)}
                        className={`cursor-pointer p-2.5 rounded-xl transition-all group relative active:scale-95 ${isUpdateOpen ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:bg-slate-700/50 hover:text-blue-400'}`}
                        title="Software Updates"
                    >
                        <Bell className={`w-5 h-5 ${isUpdateOpen ? 'animate-pulse' : 'group-hover:shake'}`} />
                        <span className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full border-2 border-slate-800"></span>
                    </button>
                    <button
                        className={`cursor-pointer p-2.5 rounded-xl transition-all group relative active:scale-95 ${isUpdateOpen ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:bg-slate-700/50 hover:text-blue-400'}`}
                        title="Documentation"
                    >
                        <a href="https://docs.daharengineer.com" target="_blank" rel="noopener noreferrer">
                            <Book className={`w-5 h-5`} />
                        </a>
                    </button>
                    <button
                        onClick={onOpenSettings}
                        className="cursor-pointer p-2.5 rounded-xl hover:bg-slate-700/50 transition-all text-slate-400 hover:text-blue-400 group relative active:scale-95"
                        title="Global Settings"
                    >
                        <Settings className="w-5 h-5 group-hover:rotate-45 transition-transform duration-300" />
                    </button>

                    {user && (
                        <button
                            onClick={logout}
                            className="cursor-pointer p-2.5 rounded-xl hover:bg-red-500/10 transition-all text-slate-400 hover:text-red-400 group relative active:scale-95"
                            title="Logout"
                        >
                            <LogOut className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
                        </button>
                    )}
                </div>
            </header>
            <div className="flex gap-2 mt-2 pl-2">
                {tabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            className={`cursor-pointer py-2 px-2 text-sm transition-all border-b-2 h-full 
                                ${isActive
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
                        <label
                            className="cursor-pointer w-10 relative py-2 px-2 text-sm text-white transition-all border-b-2 h-full text-slate-400 border-transparent hover:text-slate-300 hover:bg-slate-700/50 flex items-center justify-center"
                            title="Import DXF (Polylines)"
                        >
                            <input
                                type="file"
                                accept=".dxf"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file && onImportDXF) {
                                        onImportDXF(file);
                                    }
                                    e.target.value = ''; // Reset input
                                }}
                            />
                            <Folder className="w-5 h-5" />
                            <ArrowDown className="absolute bottom-0 w-4 h-4" />
                        </label>
                        <button
                            onClick={() => onDrawModeChange(drawMode === 'polygon' ? null : 'polygon')}
                            title="Draw Polygon"
                            className={`cursor-pointer w-10 relative  py-2 px-2 text-sm text-white transition-all border-b-2 h-full ${drawMode === 'polygon' ? 'text-blue-500 border-blue-500 font-bold rounded-t-lg bg-blue-600/20' : 'text-slate-400 border-transparent hover:text-slate-300'}`}
                        >
                            <Folder />
                            <Pen className='absolute top-1 right-1 w-4 h-4' />
                        </button>
                        <button
                            onClick={() => onDrawModeChange(drawMode === 'rectangle' ? null : 'rectangle')}
                            title="Draw Rectangle"
                            className={`cursor-pointer w-10 relative py-2 px-2 text-sm text-white transition-all border-b-2 h-full ${drawMode === 'rectangle' ? 'text-blue-500 border-blue-500 font-bold rounded-t-lg bg-blue-600/20' : 'text-slate-400 border-transparent hover:text-slate-300'}`}
                        >
                            <Square />
                            <Pen className='absolute top-1 right-1 w-4 h-4' />
                        </button>
                        <button
                            onClick={() => onDrawModeChange(drawMode === 'point_load' ? null : 'point_load')}
                            title="Draw Point Load"
                            className={`cursor-pointer w-10 relative py-2 px-2 text-sm text-white transition-all border-b-2 h-full ${drawMode === 'point_load' ? 'text-blue-500 border-blue-500 font-bold rounded-t-lg bg-blue-600/20' : 'text-slate-400 border-transparent hover:text-slate-300'}`}
                        >
                            <div className="relative">
                                <ArrowDownToDot />
                                <Pen className='absolute -top-1 -right-1 w-3 h-3' />
                            </div>
                        </button>
                        <button
                            onClick={() => onDrawModeChange(drawMode === 'line_load' ? null : 'line_load')}
                            title="Draw Line Load"
                            className={`cursor-pointer w-10 relative py-2 px-2 text-sm text-white transition-all border-b-2 h-full ${drawMode === 'line_load' ? 'text-blue-500 border-blue-500 font-bold rounded-t-lg bg-blue-600/20' : 'text-slate-400 border-transparent hover:text-slate-300'}`}
                        >
                            <div className="relative">
                                <ArrowDownToLine />
                                <Pen className='absolute -top-1 -right-1 w-3 h-3' />
                            </div>
                        </button>
                        <button
                            onClick={() => onDrawModeChange(drawMode === 'water_level' ? null : 'water_level')}
                            title="Draw Water Level"
                            className={`cursor-pointer w-10 relative py-2 px-2 text-sm text-white transition-all border-b-2 h-full ${drawMode === 'water_level' ? 'text-blue-500 border-blue-500 font-bold rounded-t-lg bg-blue-600/20' : 'text-slate-400 border-transparent hover:text-slate-300'}`}
                        >
                            <ChartNoAxesColumnIncreasing className='absolute bottom-2.5 left-1 w-5 h-5 -rotate-90' />
                            <ChartNoAxesColumnDecreasing className='absolute bottom-2.5 right-1 w-5 h-5 rotate-90' />
                            <Pen className='absolute top-1 -right-1 w-3 h-3' />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
