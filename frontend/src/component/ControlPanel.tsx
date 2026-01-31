import React from 'react';

interface ControlPanelProps {
    onGenerateMesh: () => void;
    onRunAnalysis: () => void;
    isGeneratingMesh: boolean;
    isRunningAnalysis: boolean;
    meshStatus: 'none' | 'success' | 'error';
    solverStatus: 'none' | 'success' | 'error';
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
    onGenerateMesh,
    onRunAnalysis,
    isGeneratingMesh,
    isRunningAnalysis,
    meshStatus,
    solverStatus,
}) => {
    return (
        <div className="control-panel" style={{
            display: 'flex',
            gap: '1rem',
            padding: '1rem',
            background: 'var(--surface-color)',
            borderBottom: '1px solid var(--border-color)',
            alignItems: 'center'
        }}>
            <h1 style={{ marginRight: 'auto', fontSize: '1.25rem', fontWeight: 'bold' }}>DaharTerraSim 2D</h1>

            <button
                onClick={onGenerateMesh}
                disabled={isGeneratingMesh}
                style={{
                    background: 'var(--primary-color)',
                    color: 'white',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.25rem',
                    opacity: isGeneratingMesh ? 0.7 : 1
                }}
            >
                {isGeneratingMesh ? 'Generating...' : 'Generate Mesh'}
            </button>

            <span style={{ fontSize: '0.875rem', color: meshStatus === 'success' ? 'var(--success-color)' : meshStatus === 'error' ? 'var(--error-color)' : 'gray' }}>
                {meshStatus === 'success' ? 'Mesh Ready' : meshStatus === 'error' ? 'Mesh Failed' : ''}
            </span>

            <div style={{ width: '1px', height: '24px', background: 'var(--border-color)', margin: '0 0.5rem' }} />

            <button
                onClick={onRunAnalysis}
                disabled={isRunningAnalysis || meshStatus !== 'success'}
                style={{
                    background: 'var(--success-color)', // Green for run
                    color: 'white',
                    padding: '0.5rem 1rem',
                    borderRadius: '0.25rem',
                    opacity: (isRunningAnalysis || meshStatus !== 'success') ? 0.5 : 1,
                    cursor: (isRunningAnalysis || meshStatus !== 'success') ? 'not-allowed' : 'pointer'
                }}
            >
                {isRunningAnalysis ? 'Running...' : 'Run Analysis'}
            </button>

            <span style={{ fontSize: '0.875rem', color: solverStatus === 'success' ? 'var(--success-color)' : solverStatus === 'error' ? 'var(--error-color)' : 'gray' }}>
                {solverStatus === 'success' ? 'Analysis Complete' : solverStatus === 'error' ? 'Analysis Failed' : ''}
            </span>
        </div>
    );
};
