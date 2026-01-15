import { useState, useEffect } from 'react';

export function usePersistentState<T>(
    key: string,
    defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
    // Initialize state with value from localStorage or default
    const [state, setState] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);
            if (item) {
                const parsed = JSON.parse(item);
                // Handle null values properly
                if (parsed === null && defaultValue === null) {
                    return null as T;
                }
                return parsed;
            }
            return defaultValue;
        } catch (error) {
            console.warn(`Error reading localStorage key "${key}":`, error);
            return defaultValue;
        }
    });

    // Update localStorage when state changes
    useEffect(() => {
        try {
            // Handle null values properly
            if (state === null) {
                window.localStorage.setItem(key, 'null');
            } else {
                window.localStorage.setItem(key, JSON.stringify(state));
            }
        } catch (error) {
            console.warn(`Error setting localStorage key "${key}":`, error);
        }
    }, [key, state]);

    return [state, setState];
}

// Special hook for handling material objects
export function usePersistentMaterialState(
    key: string,
    defaultValue: any
): [any, (value: any | ((prev: any) => any)) => void] {
    const [state, setState] = usePersistentState(key, defaultValue);
    
    // Clear material state when it's no longer valid
    useEffect(() => {
        if (state && typeof state === 'object' && state.id === undefined) {
            setState(null);
        }
    }, [state, setState]);

    return [state, setState];
} 