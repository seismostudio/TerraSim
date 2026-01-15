import { useEffect } from "react";
import { useAppContext } from "../App";

export default function TabWizard() {
    const { 
        setInputWizard, 
        inputWizard, 
        setResultsWizard, 
        resultsWizard, 
        setMeshWizard,
        meshWizard,
        results,
        stagingWizard,
        setStagingWizard
    } = useAppContext();
    
    const handleInput = () => {
        setInputWizard(true);
        setResultsWizard(false);
        setMeshWizard(false);
        setStagingWizard(false);
    };

    const handleResults = () => {
        setResultsWizard(true);
        setInputWizard(false);
        setMeshWizard(false);
        setStagingWizard(false);
    };

    const handleMesh = () => {
        setMeshWizard(true);
        setInputWizard(false);
        setResultsWizard(false);
        setStagingWizard(false);
    };

    const handleStaging = () => {
        setStagingWizard(true);
        setInputWizard(false);
        setMeshWizard(false);
        setResultsWizard(false);
    };
    
    return (
        <div className="flex flex-row gap-2 items-center justify-start py-2 px-4 border-b border-gray-200">
            <button 
                className={`text-sm border rounded-md px-2 py-1 transition-colors ${
                    inputWizard 
                        ? 'border-black bg-black text-white' 
                        : 'border-gray-400 hover:bg-gray-200'
                }`}
                title="Input Data"
                onClick={handleInput}
            >
                Input
            </button>
            <div className="w-10 h-[1px] bg-gray-200"/>
            <button 
                className={`text-sm border rounded-md px-2 py-1 transition-colors ${
                    meshWizard 
                        ? 'border-black bg-black text-white' 
                        : 'border-gray-400 hover:bg-gray-200'
                }`}
                title="Mesh Generation"
                onClick={handleMesh}
            >
                Mesh
            </button>
            <div className="w-10 h-[1px] bg-gray-200"/>
            <button 
                className={`text-sm border rounded-md px-2 py-1 transition-colors ${
                    stagingWizard 
                        ? 'border-black bg-black text-white' 
                        : 'border-gray-400 hover:bg-gray-200'
                }`}
                title="Staging"
                onClick={handleStaging}
            >
                Staging
            </button>
            <div className="w-10 h-[1px] bg-gray-200"/>
            <button 
                className={`text-sm border rounded-md px-2 py-1 transition-colors ${
                    resultsWizard 
                        ? 'border-black bg-black text-white' 
                        : 'border-gray-400 hover:bg-gray-200'
                }`}
                title="Results"
                onClick={handleResults}
            >
                Results
            </button>
        </div>
    )
}