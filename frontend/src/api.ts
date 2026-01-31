import { MeshRequest, MeshResponse, SolverRequest } from './types';

const API_BASE_URL = 'http://localhost:8000/api'; // Adjust if needed

export const api = {
    generateMesh: async (request: MeshRequest): Promise<MeshResponse> => {
        const response = await fetch(`${API_BASE_URL}/mesh/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        if (!response.ok) {
            throw new Error(`Mesh generation failed: ${response.statusText}`);
        }
        return response.json();
    },

    solve: async (request: SolverRequest, signal?: AbortSignal): Promise<Response> => {
        return fetch(`${API_BASE_URL}/solver/calculate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal
        });
    },
};
