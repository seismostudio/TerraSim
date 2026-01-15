import React, { useState, useEffect, useRef } from 'react';
import { BookIcon, FileIcon, FolderOpenIcon, SaveIcon, SettingsIcon, EditIcon } from "lucide-react";
import SettingsPanel from './SettingsPanel';
import useLocalStorage from '../hooks/useLocalStorage';

export default function Header() {
    const [showSettings, setShowSettings] = useState(false);
    const [projectName, setProjectName] = useLocalStorage('terrasim_project_name', 'New Project');
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(projectName);
    const inputRef = useRef<HTMLInputElement>(null);

    // Update editValue when projectName changes
    useEffect(() => {
        setEditValue(projectName);
    }, [projectName]);

    // Focus input when editing starts
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            inputRef.current.select();
        }
    }, [isEditing]);

    const handleSettingsClick = () => {
        setShowSettings(true);
    };

    const handleSettingsClose = () => {
        setShowSettings(false);
    };

    const handleProjectNameClick = () => {
        setIsEditing(true);
        setEditValue(projectName);
    };

    const handleProjectNameSave = () => {
        const trimmedValue = editValue.trim();
        if (trimmedValue) {
            setProjectName(trimmedValue);
        } else {
            setEditValue(projectName); // Reset to original if empty
        }
        setIsEditing(false);
    };

    const handleProjectNameCancel = () => {
        setEditValue(projectName);
        setIsEditing(false);
    };

    const handleProjectNameKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleProjectNameSave();
        } else if (e.key === 'Escape') {
            handleProjectNameCancel();
        }
    };

    return (
        <div className="flex justify-between items-center w-full py-2 px-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
                <img src="/assets/Logo.png" alt="TerraSim" className="w-8 h-8" />
                <span className="font-bold text-lg">TerraSim v0.1 (beta)</span>
                <span className="text-lg">|</span>
                <FileIcon className="w-4 h-4 text-gray-500" />
                {isEditing ? (
                    <div className="flex items-center gap-1">
                        <input
                            ref={inputRef}
                            type="text"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={handleProjectNameKeyDown}
                            onBlur={handleProjectNameSave}
                            className="text-sm text-gray-700 border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-gray-500 min-w-[120px]"
                            placeholder="Enter project name"
                        />
                    </div>
                ) : (
                    <div 
                        className="flex items-center gap-1 cursor-pointer hover:bg-gray-100 rounded px-2 py-1 transition-colors group"
                        onClick={handleProjectNameClick}
                        title="Click to edit project name"
                    >
                        <span className="text-sm leading-4 text-gray-500 group-hover:text-gray-700">
                            {projectName}
                        </span>
                        <EditIcon className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                )}
            </div>
            <div className="flex items-center gap-2">
                <button 
                    title="Save"
                    className="bg-black text-white px-3 py-2 rounded-md">
                    <SaveIcon className="w-4 h-4" />
                </button>
                <button     
                    title="Open"
                    className="bg-black text-white px-3 py-2 rounded-md">
                    <FolderOpenIcon className="w-4 h-4" />
                </button>
                <button 
                    title="Settings"
                    onClick={handleSettingsClick}
                    className="bg-black text-white px-3 py-2 rounded-md">
                    <SettingsIcon className="w-4 h-4" />
                </button>
                <button 
                    title="Documentation"
                    className="bg-black text-white px-3 py-2 rounded-md">
                    <BookIcon className="w-4 h-4" />
                </button>
            </div>
            {showSettings && (
                <SettingsPanel isVisible={showSettings} onClose={handleSettingsClose} />
            )}
        </div>
    )
}