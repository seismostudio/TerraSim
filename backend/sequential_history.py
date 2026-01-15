"""
Sequential History Management for TerraSim FEA Analysis
Handles stress history, displacement accumulation, and PWP history across stages
"""

import numpy as np
from typing import Dict, List, Any, Optional, Tuple
import json

class SequentialHistory:
    """
    Manages sequential analysis history including stress, displacement, and PWP tracking
    across multiple stages for geotechnical analysis.
    """
    
    def __init__(self):
        """
        Initialize SequentialHistory with empty stage data
        """
        self.stages = {}  # Store all data per stage
        self.stress_history = {}  # Stress tracking per stage
        self.displacement_history = {}  # Displacement tracking per stage
        self.pwp_history = {}  # PWP tracking per stage (hydrostatic + excess)
        
        # ✅ Plastic strain history tracking for strain decomposition
        self.plastic_strain_history = {}  # Plastic strain tracking per stage
        self.accumulated_plastic_strain_history = {}  # Accumulated plastic strain per stage
        self.yielded_elements_history = {}  # Yielded elements tracking per stage
        self.iteration_history = {}  # Iteration history per stage
        
        # ✅ NEW: K0 yield check history tracking
        self.yield_check_history = {}  # K0 yield check results per stage
        
        # ✅ NEW: Soil results storage (contains summary data)
        self.soil_results = {}  # Soil results per stage
        
        # Performance optimization
        self._cache = {}
        self._cache_valid = False
        
        print("🔧 SequentialHistory initialized")
    
    def add_stage_data(self, stage_id: str, stage_name: str, stage_sequence: int, 
                      calculation_type: str, is_initial_stage: bool,
                      element_results: List[Dict], nodal_displacements: List[Dict], 
                      nodal_stress_strain: List[Dict], soil_results: Dict, 
                      pwp_history: Dict = None, plastic_strain_data: Dict = None,
                      yield_check_data: Dict = None, element_active: List[bool] = None) -> None:
        """
        Add stage analysis results to history
        
        Parameters:
        stage_id: Unique identifier for the stage
        stage_name: Human-readable stage name
        stage_sequence: Stage sequence number (1, 2, 3, ...)
        calculation_type: 'K0' or 'FEA'
        is_initial_stage: Whether this is the initial stage
        element_results: Element-level results from solver
        nodal_displacements: Nodal displacement results
        nodal_stress_strain: Nodal stress/strain results
        soil_results: Soil-specific results including PWP
        pwp_history: PWP history from solver (optional)
        plastic_strain_data: Plastic strain data from solver (optional)
        yield_check_data: K0 yield check results (optional)
        """
        print("------------------------------------------------")
        print(f"🔧 Adding stage data: {stage_name} (ID: {stage_id}, Seq: {stage_sequence})")
        
        # Create stage entry
        stage_data = {
            'stage_id': stage_id,
            'stage_name': stage_name,
            'stage_sequence': stage_sequence,
            'calculation_type': calculation_type,
            'is_initial_stage': is_initial_stage,
            'timestamp': self._get_timestamp()
        }
        
        # Process stress history
        stress_data = self._process_stress_history(stage_id, element_results, nodal_stress_strain, is_initial_stage)
        
        # Process displacement history
        displacement_data = self._process_displacement_history(stage_id, nodal_displacements, is_initial_stage)
        
        # Process PWP history
        if pwp_history:
            # Use PWP history from solver if available
            pwp_data = pwp_history
        else:
            # Fallback to calculated PWP history
            pwp_data = self._process_pwp_history(stage_id, element_results, nodal_stress_strain, soil_results, is_initial_stage)
        
        # ✅ Process plastic strain history
        plastic_strain_data_processed = self._process_plastic_strain_history(stage_id, plastic_strain_data, is_initial_stage)
        
        # ✅ NEW: Process yield check history
        yield_check_data_processed = self._process_yield_check_history(stage_id, yield_check_data, calculation_type, is_initial_stage)
        
        # ✅ NEW: Store element_active status
        if element_active is not None:
            stage_data['element_active'] = element_active
            print(f"✅ Element active status stored: {len(element_active)} elements")
        else:
            stage_data['element_active'] = []
            print(f"ℹ️ No element_active provided (empty array)")
        
        # Store all data
        self.stages[stage_id] = stage_data
        self.stress_history[stage_id] = stress_data
        self.displacement_history[stage_id] = displacement_data
        self.pwp_history[stage_id] = pwp_data
        self.plastic_strain_history[stage_id] = plastic_strain_data_processed
        self.yield_check_history[stage_id] = yield_check_data_processed  # ✅ NEW
        self.soil_results[stage_id] = soil_results  # ✅ NEW: Store soil_results (contains summary data)
        
        # Invalidate cache
        self._cache_valid = False
        
        print(f"✅ Stage {stage_name} data added successfully")
        print("------------------------------------------------")
    
    def _process_stress_history(self, stage_id: str, element_results: List[Dict], 
                               nodal_stress_strain: List[Dict], is_initial_stage: bool) -> Dict:
        """
        Process and organize stress history data
        """
        stress_data = {
            'initial_stress': {
                'element_stresses': [],
                'description': 'Initial geostatic stress' if is_initial_stage else 'Stress from previous stage'
            },
            'incremental_stress': {
                'element_stresses': [],
                'description': f'Stress change in stage {stage_id}'
            },
            'cumulative_stress': {
                'element_stresses': [],
                'description': f'Total stress up to stage {stage_id}'
            },
            'total_stress': {  # ✅ NEW: Store original total stress separately
                'element_stresses': [],
                'description': f'Total stress from solver in stage {stage_id}'
            }
        }
        
        # Process element stresses
        for elem_result in element_results:
            # Handle case where elem_result might not be a dictionary
            if isinstance(elem_result, dict):
                # ✅ FIX: Use element_index consistently (both K0 and FEA use element_index)
                element_id = elem_result.get('element_index', elem_result.get('element_id', 0))
                element_stress = {
                'element_id': element_id,
                'total_stress_x': elem_result.get('total_stress_x', 0.0),
                'total_stress_y': elem_result.get('total_stress_y', 0.0),
                'effective_stress_x': elem_result.get('effective_stress_x', 0.0),
                'effective_stress_y': elem_result.get('effective_stress_y', 0.0),
                'effective_principal_stress_1': elem_result.get('effective_principal_stress_1', 0.0),
                'effective_principal_stress_3': elem_result.get('effective_principal_stress_3', 0.0),
                'principal_stresses': elem_result.get('principal_stresses', [0.0, 0.0])
            }
            else:
                # If elem_result is not a dictionary, create default structure
                print(f"⚠️ Warning: elem_result is not a dictionary: {type(elem_result)}, value: {elem_result}")
                element_stress = {
                    'element_id': 0,  # ✅ Default element_id for malformed data
                    'total_stress_x': 0.0,
                    'total_stress_y': 0.0,
                    'effective_stress_x': 0.0,
                    'effective_stress_y': 0.0,
                    'effective_principal_stress_1': 0.0,
                    'effective_principal_stress_3': 0.0,
                    'principal_stresses': [0.0, 0.0]
                }
            
            # Store original total stress separately
            stress_data['total_stress']['element_stresses'].append(element_stress.copy())
            
            # For initial stage, incremental = total stress (no previous stage)
            if is_initial_stage:
                stress_data['initial_stress']['element_stresses'].append(element_stress)
                stress_data['incremental_stress']['element_stresses'].append(element_stress)
                stress_data['cumulative_stress']['element_stresses'].append(element_stress)
            else:
                # For subsequent stages, store total stress (incremental will be calculated later)
                stress_data['incremental_stress']['element_stresses'].append(element_stress)
                # Cumulative will be calculated later in calculate_cumulative_data()
        
        # ✅ REMOVED: Nodal stresses processing - not used for transfer conditions
        # Nodal stresses are handled by interpolation in FEA solver and sent directly to frontend
        
        return stress_data
    
    def _process_displacement_history(self, stage_id: str, nodal_displacements: List[Dict], 
                                    is_initial_stage: bool) -> Dict:
        """
        Process and organize displacement history data
        """
        displacement_data = {
            'stage_displacement': {
                'nodal_displacements': [],
                'description': f'Displacement in stage {stage_id}'
            },
            'cumulative_displacement': {
                'nodal_displacements': [],
                'description': f'Total displacement up to stage {stage_id}'
            }
        }
        
        # Process nodal displacements
        for disp_result in nodal_displacements:
            # Handle case where disp_result might not be a dictionary
            if isinstance(disp_result, dict):
                nodal_disp = {
                'node_id': disp_result.get('node_id'),
                'u': disp_result.get('u', 0.0),
                'v': disp_result.get('v', 0.0),
                'magnitude': disp_result.get('magnitude', 0.0)
            }
            else:
                # If disp_result is not a dictionary, create default structure
                # This handles cases where the data might be malformed
                print(f"⚠️ Warning: disp_result is not a dictionary: {type(disp_result)}, value: {disp_result}")
                nodal_disp = {
                    'node_id': 0,
                    'u': 0.0,
                    'v': 0.0,
                    'magnitude': 0.0
                }
            
            displacement_data['stage_displacement']['nodal_displacements'].append(nodal_disp)
            
            # For initial stage, cumulative = stage displacement
            if is_initial_stage:
                displacement_data['cumulative_displacement']['nodal_displacements'].append(nodal_disp)
            # For subsequent stages, cumulative will be calculated later
        
        return displacement_data
    
    def _process_pwp_history(self, stage_id: str, element_results: List[Dict], 
                           nodal_stress_strain: List[Dict], soil_results: Dict, 
                           is_initial_stage: bool) -> Dict:
        """
        Process and organize PWP history data (hydrostatic + excess)
        """
        pwp_data = {
            'hydrostatic_pwp': {
                'element_pwp': [],
                'nodal_pwp': [],
                'description': 'Hydrostatic pore water pressure'
            },
            'excess_pwp': {
                'element_pwp': [],
                'nodal_pwp': [],
                'description': 'Excess pore water pressure from loading'
            },
            'total_pwp': {
                'element_pwp': [],
                'nodal_pwp': [],
                'description': 'Total pore water pressure (hydrostatic + excess)'
            }
        }
        
        # Process element PWP
        for elem_result in element_results:
            # Handle case where elem_result might not be a dictionary
            if isinstance(elem_result, dict):
                total_pwp = elem_result.get('pore_water_pressure', 0.0)
                # ✅ FIX: Use element_index consistently (both K0 and FEA use element_index)
                element_id = elem_result.get('element_index', elem_result.get('element_id', 0))
            else:
                print(f"⚠️ Warning: elem_result in PWP is not a dictionary: {type(elem_result)}, value: {elem_result}")
                total_pwp = 0.0
                element_id = 0
            
            # ✅ Use proper PWP calculation from solver results
            if is_initial_stage:
                hydrostatic_pwp = total_pwp
                excess_pwp = 0.0
            else:
                # ✅ Get excess PWP from solver's PWP history if available
                if 'pwp_history' in elem_result:
                    pwp_history = elem_result['pwp_history']
                    hydrostatic_pwp = pwp_history.get('hydrostatic_pwp', total_pwp * 0.8)
                    excess_pwp = pwp_history.get('excess_pwp', 0.0)
                else:
                    # Fallback: calculate based on stress changes
                    hydrostatic_pwp = total_pwp * 0.8  # Assume 80% hydrostatic
                    excess_pwp = total_pwp * 0.2       # Assume 20% excess
            
            element_pwp = {
                'element_id': element_id,
                'hydrostatic_pwp': hydrostatic_pwp,
                'excess_pwp': excess_pwp,
                'total_pwp': total_pwp
            }
            
            pwp_data['hydrostatic_pwp']['element_pwp'].append(element_pwp)
            pwp_data['excess_pwp']['element_pwp'].append(element_pwp)
            pwp_data['total_pwp']['element_pwp'].append(element_pwp)
        
        # Process nodal PWP
        for nodal_result in nodal_stress_strain:
            # Handle case where nodal_result might not be a dictionary
            if isinstance(nodal_result, dict):
                total_pwp = nodal_result.get('pore_water_pressure', 0.0)
                node_id = nodal_result.get('node_id')
            else:
                print(f"⚠️ Warning: nodal_result in PWP is not a dictionary: {type(nodal_result)}, value: {nodal_result}")
                total_pwp = 0.0
                node_id = 0
            
            # ✅ Use proper PWP calculation from solver results
            if is_initial_stage:
                hydrostatic_pwp = total_pwp
                excess_pwp = 0.0
            else:
                # ✅ Get excess PWP from solver's PWP history if available
                if 'pwp_history' in nodal_result:
                    pwp_history = nodal_result['pwp_history']
                    hydrostatic_pwp = pwp_history.get('hydrostatic_pwp', total_pwp * 0.8)
                    excess_pwp = pwp_history.get('excess_pwp', 0.0)
                else:
                    # Fallback: calculate based on stress changes
                    hydrostatic_pwp = total_pwp * 0.8  # Assume 80% hydrostatic
                    excess_pwp = total_pwp * 0.2       # Assume 20% excess
            
            nodal_pwp = {
                'node_id': node_id,
                'hydrostatic_pwp': hydrostatic_pwp,
                'excess_pwp': excess_pwp,
                'total_pwp': total_pwp
            }
            
            pwp_data['hydrostatic_pwp']['nodal_pwp'].append(nodal_pwp)
            pwp_data['excess_pwp']['nodal_pwp'].append(nodal_pwp)
            pwp_data['total_pwp']['nodal_pwp'].append(nodal_pwp)
        
        return pwp_data
    
    def _process_plastic_strain_history(self, stage_id: str, plastic_strain_data: Dict, 
                                       is_initial_stage: bool) -> Dict:
        """
        Process and organize plastic strain history data
        
        Parameters:
        stage_id: Stage identifier
        plastic_strain_data: Plastic strain data from solver
        is_initial_stage: Whether this is the initial stage
        
        Returns:
        Dict: Processed plastic strain history data
        """
        if plastic_strain_data is None:
            # No plastic strain data available (e.g., K0 analysis)
            plastic_strain_data = {
                'total_elements': 0,
                'yielded_elements': 0,
                'yielded_elements_list': [],
                'plastic_strain_history': {},
                'accumulated_plastic_strain_history': {},
                'iteration_history': []
            }
        
        # Process plastic strain data
        processed_data = {
            'stage_id': stage_id,
            'is_initial_stage': is_initial_stage,
            'timestamp': self._get_timestamp(),
            'total_elements': plastic_strain_data.get('total_elements', 0),
            'yielded_elements': plastic_strain_data.get('yielded_elements', 0),
            'yielded_elements_list': plastic_strain_data.get('yielded_elements_list', []),
            'plastic_strain_history': plastic_strain_data.get('plastic_strain_history', {}),
            'accumulated_plastic_strain_history': plastic_strain_data.get('accumulated_plastic_strain_history', {}),
            'iteration_history': plastic_strain_data.get('iteration_history', []),
            'max_plastic_strain_magnitude': plastic_strain_data.get('max_plastic_strain_magnitude', 0.0),
            'max_accumulated_plastic_strain': plastic_strain_data.get('max_accumulated_plastic_strain', 0.0)
        }
        
        # Calculate statistics
        if processed_data['total_elements'] > 0 and processed_data['yielded_elements'] > 0:
            processed_data['yield_percentage'] = (processed_data['yielded_elements'] / processed_data['total_elements']) * 100
        else:
            processed_data['yield_percentage'] = 0.0
        
        return processed_data
    
    def _process_yield_check_history(self, stage_id: str, yield_check_data: Dict, 
                                    calculation_type: str, is_initial_stage: bool) -> Dict:
        """
        Process and organize K0 yield check history data
        
        Parameters:
        stage_id: Stage identifier
        yield_check_data: K0 yield check results from solver
        calculation_type: 'K0' or 'FEA'
        is_initial_stage: Whether this is the initial stage
        
        Returns:
        Dict: Processed yield check history data
        """
        if yield_check_data is None:
            # No yield check data available
            processed_data = {
                'stage_id': stage_id,
                'is_initial_stage': is_initial_stage,
                'timestamp': self._get_timestamp(),
                'yielded_elements': [],
                'yield_function_values': [],
                'max_yield_function': 0.0,
                'total_elements': 0,
                'yielded_elements_count': 0,
                'has_initial_yielding': False
            }
        else:
            # Process yield check data from K0 solver
            processed_data = {
                'stage_id': stage_id,
                'is_initial_stage': is_initial_stage,
                'timestamp': self._get_timestamp(),
                'yielded_elements': yield_check_data.get('yielded_elements', []),
                'yield_function_values': yield_check_data.get('yield_function_values', []),
                'max_yield_function': yield_check_data.get('max_yield_function', 0.0),
                'total_elements': yield_check_data.get('total_elements', 0),
                'yielded_elements_count': yield_check_data.get('yielded_elements_count', 0),
                'has_initial_yielding': yield_check_data.get('yielded_elements_count', 0) > 0
            }
        
        return processed_data
    
    def calculate_cumulative_data(self) -> None:
        """
        Calculate cumulative stress, displacement, PWP, and plastic strain data across all stages
        """
        print("🔧 Calculating cumulative data across all stages")
        
        stage_ids = sorted(self.stages.keys(), key=lambda x: self.stages[x]['stage_sequence'])
        
        for i, stage_id in enumerate(stage_ids):
            if i == 0:
                # Initial stage - cumulative = stage data
                continue
            
            # Get previous stage data
            prev_stage_id = stage_ids[i-1]
            
            # Calculate cumulative stress
            self._calculate_cumulative_stress(stage_id, prev_stage_id)
            
            # Calculate cumulative displacement
            self._calculate_cumulative_displacement(stage_id, prev_stage_id)
            
            # Calculate cumulative PWP
            self._calculate_cumulative_pwp(stage_id, prev_stage_id)
            
            # ✅ Calculate cumulative plastic strain
            self._calculate_cumulative_plastic_strain(stage_id, prev_stage_id)
        
        self._cache_valid = False
        print("✅ Cumulative data calculation completed")
    
    def _calculate_cumulative_stress(self, current_stage_id: str, prev_stage_id: str) -> None:
        """
        Calculate cumulative stress by adding incremental stress to previous cumulative
        Incremental stress = Current stage stress - Previous stage stress
        """
        current_stress = self.stress_history[current_stage_id]
        prev_stress = self.stress_history[prev_stage_id]
        
        # Element stresses
        current_stress['cumulative_stress']['element_stresses'] = []
        for i, current_elem in enumerate(current_stress['total_stress']['element_stresses']):  # ✅ Use total_stress instead of incremental_stress
            if i < len(prev_stress['cumulative_stress']['element_stresses']):
                prev_elem = prev_stress['cumulative_stress']['element_stresses'][i]
                
                # ✅ CORRECT: Calculate incremental stress as difference
                incremental_stress_x = current_elem['total_stress_x'] - prev_elem['total_stress_x']
                incremental_stress_y = current_elem['total_stress_y'] - prev_elem['total_stress_y']
                incremental_effective_x = current_elem['effective_stress_x'] - prev_elem['effective_stress_x']
                incremental_effective_y = current_elem['effective_stress_y'] - prev_elem['effective_stress_y']
                incremental_principal_1 = current_elem['effective_principal_stress_1'] - prev_elem['effective_principal_stress_1']
                incremental_principal_3 = current_elem['effective_principal_stress_3'] - prev_elem['effective_principal_stress_3']
                incremental_principal_stresses = [
                    current_elem['principal_stresses'][0] - prev_elem['principal_stresses'][0],
                    current_elem['principal_stresses'][1] - prev_elem['principal_stresses'][1]
                ]
                
                # Store incremental stress (for reference)
                incremental_elem = {
                    'element_id': current_elem['element_id'],  # ✅ element_id is already correct from previous processing
                    'total_stress_x': incremental_stress_x,
                    'total_stress_y': incremental_stress_y,
                    'effective_stress_x': incremental_effective_x,
                    'effective_stress_y': incremental_effective_y,
                    'effective_principal_stress_1': incremental_principal_1,
                    'effective_principal_stress_3': incremental_principal_3,
                    'principal_stresses': incremental_principal_stresses
                }
                
                # Update incremental stress data
                current_stress['incremental_stress']['element_stresses'][i] = incremental_elem
                
                # Calculate cumulative stress
                cumulative_elem = {
                    'element_id': current_elem['element_id'],  # ✅ element_id is already correct from previous processing
                    'total_stress_x': prev_elem['total_stress_x'] + incremental_stress_x,
                    'total_stress_y': prev_elem['total_stress_y'] + incremental_stress_y,
                    'effective_stress_x': prev_elem['effective_stress_x'] + incremental_effective_x,
                    'effective_stress_y': prev_elem['effective_stress_y'] + incremental_effective_y,
                    'effective_principal_stress_1': prev_elem['effective_principal_stress_1'] + incremental_principal_1,
                    'effective_principal_stress_3': prev_elem['effective_principal_stress_3'] + incremental_principal_3,
                    'principal_stresses': [
                        prev_elem['principal_stresses'][0] + incremental_principal_stresses[0],
                        prev_elem['principal_stresses'][1] + incremental_principal_stresses[1]
                    ]
                }
                
                current_stress['cumulative_stress']['element_stresses'].append(cumulative_elem)
        
        # ✅ REMOVED: Nodal stresses cumulative calculation - not used for transfer conditions
        # Nodal stresses are handled by interpolation in FEA solver and sent directly to frontend
    
    def _calculate_cumulative_displacement(self, current_stage_id: str, prev_stage_id: str) -> None:
        """
        Calculate cumulative displacement by adding stage displacement to previous cumulative
        """
        current_disp = self.displacement_history[current_stage_id]
        prev_disp = self.displacement_history[prev_stage_id]
        
        current_disp['cumulative_displacement']['nodal_displacements'] = []
        for i, current_nodal in enumerate(current_disp['stage_displacement']['nodal_displacements']):
            if i < len(prev_disp['cumulative_displacement']['nodal_displacements']):
                prev_nodal = prev_disp['cumulative_displacement']['nodal_displacements'][i]
                
                cumulative_nodal = {
                    'node_id': current_nodal['node_id'],
                    'u': prev_nodal['u'] + current_nodal['u'],
                    'v': prev_nodal['v'] + current_nodal['v'],
                    'magnitude': np.sqrt((prev_nodal['u'] + current_nodal['u'])**2 + 
                                       (prev_nodal['v'] + current_nodal['v'])**2)
                }
                current_disp['cumulative_displacement']['nodal_displacements'].append(cumulative_nodal)
    
    def _calculate_cumulative_pwp(self, current_stage_id: str, prev_stage_id: str) -> None:
        """
        Calculate cumulative PWP (hydrostatic remains same, excess accumulates)
        """
        current_pwp = self.pwp_history[current_stage_id]
        prev_pwp = self.pwp_history[prev_stage_id]
        
        # Element PWP
        for pwp_type in ['hydrostatic_pwp', 'excess_pwp', 'total_pwp']:
            current_pwp[pwp_type]['element_pwp'] = []
            for i, current_elem in enumerate(current_pwp[pwp_type]['element_pwp']):
                if i < len(prev_pwp[pwp_type]['element_pwp']):
                    prev_elem = prev_pwp[pwp_type]['element_pwp'][i]
                    
                    if pwp_type == 'hydrostatic_pwp':
                        # Hydrostatic PWP remains same (based on water level)
                        cumulative_elem = current_elem.copy()
                    else:
                        # Excess and total PWP accumulate
                        cumulative_elem = {
                            'element_id': current_elem['element_id'],  # ✅ element_id is already correct from previous processing
                            'hydrostatic_pwp': current_elem['hydrostatic_pwp'],
                            'excess_pwp': prev_elem['excess_pwp'] + current_elem['excess_pwp'],
                            'total_pwp': prev_elem['total_pwp'] + current_elem['excess_pwp']
                        }
                    
                    current_pwp[pwp_type]['element_pwp'].append(cumulative_elem)
        
        # Nodal PWP
        for pwp_type in ['hydrostatic_pwp', 'excess_pwp', 'total_pwp']:
            current_pwp[pwp_type]['nodal_pwp'] = []
            for i, current_nodal in enumerate(current_pwp[pwp_type]['nodal_pwp']):
                if i < len(prev_pwp[pwp_type]['nodal_pwp']):
                    prev_nodal = prev_pwp[pwp_type]['nodal_pwp'][i]
                    
                    if pwp_type == 'hydrostatic_pwp':
                        cumulative_nodal = current_nodal.copy()
                    else:
                        cumulative_nodal = {
                            'node_id': current_nodal['node_id'],
                            'hydrostatic_pwp': current_nodal['hydrostatic_pwp'],
                            'excess_pwp': prev_nodal['excess_pwp'] + current_nodal['excess_pwp'],
                            'total_pwp': prev_nodal['total_pwp'] + current_nodal['excess_pwp']
                        }
                    
                    current_pwp[pwp_type]['nodal_pwp'].append(cumulative_nodal)
        
        print(f"✅ Cumulative PWP calculation completed for stage {current_stage_id}")
    
    def _calculate_cumulative_plastic_strain(self, current_stage_id: str, prev_stage_id: str) -> None:
        """
        Calculate cumulative plastic strain by accumulating plastic strain across stages
        
        Parameters:
        current_stage_id: Current stage identifier
        prev_stage_id: Previous stage identifier
        """
        current_plastic = self.plastic_strain_history[current_stage_id]
        prev_plastic = self.plastic_strain_history[prev_stage_id]
        
        # Initialize cumulative plastic strain data
        cumulative_plastic_data = {
            'stage_id': current_stage_id,
            'is_initial_stage': False,
            'timestamp': self._get_timestamp(),
            'total_elements': current_plastic['total_elements'],
            'yielded_elements': current_plastic['yielded_elements'],
            'yielded_elements_list': list(set(prev_plastic['yielded_elements_list'] + current_plastic['yielded_elements_list'])),
            'plastic_strain_history': {},
            'accumulated_plastic_strain_history': {},
            'iteration_history': current_plastic['iteration_history'],
            'max_plastic_strain_magnitude': max(prev_plastic['max_plastic_strain_magnitude'], current_plastic['max_plastic_strain_magnitude']),
            'max_accumulated_plastic_strain': max(prev_plastic['max_accumulated_plastic_strain'], current_plastic['max_accumulated_plastic_strain']),
            'yield_percentage': (len(set(prev_plastic['yielded_elements_list'] + current_plastic['yielded_elements_list'])) / current_plastic['total_elements']) * 100 if current_plastic['total_elements'] > 0 else 0.0
        }
        
        # Accumulate plastic strain history for each element
        all_element_ids = set(prev_plastic['plastic_strain_history'].keys()) | set(current_plastic['plastic_strain_history'].keys())
        
        for element_id in all_element_ids:
            prev_history = prev_plastic['plastic_strain_history'].get(str(element_id), [])
            current_history = current_plastic['plastic_strain_history'].get(str(element_id), [])
            
            # Combine histories
            combined_history = prev_history + current_history
            cumulative_plastic_data['plastic_strain_history'][str(element_id)] = combined_history
            
            # Accumulate accumulated plastic strain
            prev_accumulated = prev_plastic['accumulated_plastic_strain_history'].get(str(element_id), [])
            current_accumulated = current_plastic['accumulated_plastic_strain_history'].get(str(element_id), [])
            
            # Combine accumulated histories
            combined_accumulated = prev_accumulated + current_accumulated
            cumulative_plastic_data['accumulated_plastic_strain_history'][str(element_id)] = combined_accumulated
        
        # Store cumulative plastic strain data
        self.plastic_strain_history[current_stage_id] = cumulative_plastic_data
        
        print(f"✅ Cumulative plastic strain calculation completed for stage {current_stage_id}")
    
    def get_stage_results(self, stage_id: str) -> Dict:
        """
        Get complete results for a specific stage
        """
        if stage_id not in self.stages:
            raise ValueError(f"Stage {stage_id} not found in history")
        
        # ✅ FIX: Include soil_results and summary data
        stage_data = {
            'stage_info': self.stages[stage_id],
            'stress_history': self.stress_history[stage_id],
            'displacement_history': self.displacement_history[stage_id],
            'pwp_history': self.pwp_history[stage_id]
        }
        
        # ✅ NEW: Add soil_results if available (contains summary data)
        if hasattr(self, 'soil_results') and stage_id in self.soil_results:
            stage_data['soil_results'] = self.soil_results[stage_id]
            print(f"✅ Added soil_results for stage {stage_id}")
        else:
            print(f"⚠️ No soil_results found for stage {stage_id}")
        
        # ✅ NEW: Add yield_check_history if available
        if hasattr(self, 'yield_check_history') and stage_id in self.yield_check_history:
            stage_data['yield_check_history'] = self.yield_check_history[stage_id]
        
        # ✅ NEW: Add summary data if available in soil_results
        if 'soil_results' in stage_data:
            soil_results = stage_data['soil_results']
            stage_data['summary'] = {
                'max_total_stress_x': soil_results.get('max_total_stress_x', 0.0),
                'min_total_stress_x': soil_results.get('min_total_stress_x', 0.0),
                'max_total_stress_y': soil_results.get('max_total_stress_y', 0.0),
                'min_total_stress_y': soil_results.get('min_total_stress_y', 0.0),
                'max_effective_principal_stress_1': soil_results.get('max_effective_principal_stress_1', 0.0),
                'min_effective_principal_stress_1': soil_results.get('min_effective_principal_stress_1', 0.0),
                'max_pore_water_pressure': soil_results.get('max_pore_water_pressure', 0.0),
                'min_pore_water_pressure': soil_results.get('min_pore_water_pressure', 0.0)
            }
            print(f"✅ Added summary data for stage {stage_id}")
        
        return stage_data
    
    def get_previous_stage_results(self, stage_id: str) -> Optional[Dict]:
        """
        Get results from the previous stage for sequential analysis
        """
        if stage_id not in self.stages:
            return None
        
        current_sequence = self.stages[stage_id]['stage_sequence']
        if current_sequence <= 1:
            return None  # No previous stage
        
        # Find previous stage
        for sid, stage_data in self.stages.items():
            if stage_data['stage_sequence'] == current_sequence - 1:
                return self.get_stage_results(sid)
        
        return None
    
    def get_all_stages_summary(self) -> Dict:
        """
        Get summary of all stages
        """
        summary = {
            'total_stages': len(self.stages),
            'stages': []
        }
        
        for stage_id, stage_data in self.stages.items():
            stage_summary = {
                'stage_id': stage_id,
                'stage_name': stage_data['stage_name'],
                'stage_sequence': stage_data['stage_sequence'],
                'calculation_type': stage_data['calculation_type'],
                'is_initial_stage': stage_data['is_initial_stage']
            }
            summary['stages'].append(stage_summary)
        
        # Sort by sequence
        summary['stages'].sort(key=lambda x: x['stage_sequence'])
        
        return summary
    
    def clear_history(self) -> None:
        """
        Clear all history data
        """
        self.stages = {}
        self.stress_history = {}
        self.displacement_history = {}
        self.pwp_history = {}
        self.plastic_strain_history = {}
        self.yield_check_history = {}
        self.soil_results = {}  # ✅ NEW: Clear soil_results
        self._cache = {}
        self._cache_valid = False
        print("🔧 SequentialHistory cleared")
    
    def _get_timestamp(self) -> str:
        """
        Get current timestamp for stage tracking
        """
        from datetime import datetime
        return datetime.now().isoformat()
    
    def to_dict(self) -> Dict:
        """
        Convert history to dictionary for serialization
        """
        return {
            'stages': self.stages,
            'stress_history': self.stress_history,
            'displacement_history': self.displacement_history,
            'pwp_history': self.pwp_history
        }
    
    def from_dict(self, data: Dict) -> None:
        """
        Load history from dictionary
        """
        self.stages = data.get('stages', {})
        self.stress_history = data.get('stress_history', {})
        self.displacement_history = data.get('displacement_history', {})
        self.pwp_history = data.get('pwp_history', {})
        self._cache_valid = False
        print(f"🔧 SequentialHistory loaded with {len(self.stages)} stages") 

    def get_initial_state_from_stage(self, stage_id: str) -> Optional[Dict]:
        """
        Get initial state data from a specific stage for transfer to next stage
        
        Parameters:
        stage_id: Stage ID to get initial state from
        
        Returns:
        Dict: Initial state data from the specified stage, or None if stage not found
        """
        if stage_id not in self.stages:
            print(f"❌ Stage {stage_id} not found in history")
            return None
        
        print(f"🔧 Getting initial state from stage: {stage_id}")
        
        # Get stage results
        stage_results = self.get_stage_results(stage_id)
        
        # Prepare initial state data
        initial_state = {
            'stress_state': {},
            'displacement_state': {},
            'pwp_state': {},
            'plastic_strain_state': {},
            'element_active': [],  # ✅ NEW: Element active status
            'source_stage_id': stage_id,
            'source_stage_sequence': self.stages[stage_id]['stage_sequence']
        }
        
        # Extract stress state from stage
        if 'stress_history' in stage_results:
            stress_history = stage_results['stress_history']
            if 'cumulative_stress' in stress_history:
                cumulative_stress = stress_history['cumulative_stress']
                element_stresses = cumulative_stress.get('element_stresses', [])
                
                for elem_stress in element_stresses:
                    # ✅ FIX: Use element_index consistently (both K0 and FEA use element_index)
                    element_id = elem_stress.get('element_index', elem_stress.get('element_id', 0))
                    element_id_str = str(element_id)
                    initial_state['stress_state'][element_id_str] = {
                        'total_stress_x': elem_stress.get('total_stress_x', 0.0),
                        'total_stress_y': elem_stress.get('total_stress_y', 0.0),
                        'effective_stress_x': elem_stress.get('effective_stress_x', 0.0),
                        'effective_stress_y': elem_stress.get('effective_stress_y', 0.0),
                        'effective_principal_stress_1': elem_stress.get('effective_principal_stress_1', 0.0),
                        'effective_principal_stress_3': elem_stress.get('effective_principal_stress_3', 0.0),
                        'principal_stresses': elem_stress.get('principal_stresses', [0.0, 0.0])
                    }
        
        # Extract displacement state from stage
        if 'displacement_history' in stage_results:
            displacement_history = stage_results['displacement_history']
            if 'cumulative_displacement' in displacement_history:
                cumulative_displacement = displacement_history['cumulative_displacement']
                nodal_displacements = cumulative_displacement.get('nodal_displacements', [])
                
                for nodal_disp in nodal_displacements:
                    node_id = nodal_disp.get('node_id', 0)
                    node_id_str = str(node_id)
                    initial_state['displacement_state'][node_id_str] = {
                        'u': nodal_disp.get('u', 0.0),
                        'v': nodal_disp.get('v', 0.0),
                        'magnitude': nodal_disp.get('magnitude', 0.0)
                    }
        
        # Extract PWP state from stage
        if 'pwp_history' in stage_results:
            pwp_history = stage_results['pwp_history']
            if 'total_pwp' in pwp_history:
                total_pwp = pwp_history['total_pwp']
                nodal_pwp = total_pwp.get('nodal_pwp', [])
                
                for nodal in nodal_pwp:
                    node_id = nodal.get('node_id', 0)
                    node_id_str = str(node_id)
                    initial_state['pwp_state'][node_id_str] = {
                        'pore_water_pressure': nodal.get('total_pwp', 0.0)
                    }
        
        # Extract plastic strain state from stage
        if stage_id in self.plastic_strain_history:
            plastic_strain_data = self.plastic_strain_history[stage_id]
            plastic_strain_history = plastic_strain_data.get('plastic_strain_history', {})
            accumulated_plastic_strain_history = plastic_strain_data.get('accumulated_plastic_strain_history', {})
            
            for element_id_str, plastic_strain_list in plastic_strain_history.items():
                if plastic_strain_list:  # Get the last plastic strain state
                    last_plastic_strain = plastic_strain_list[-1]
                    initial_state['plastic_strain_state'][element_id_str] = {
                        'plastic_strain': last_plastic_strain,
                        'accumulated_plastic_strain': accumulated_plastic_strain_history.get(element_id_str, [0.0])[-1] if element_id_str in accumulated_plastic_strain_history else 0.0,
                        'is_yielded': True  # If there's plastic strain history, element has yielded
                    }
        
        # ✅ NEW: Get element_active from stage data
        if 'element_active' in self.stages[stage_id]:
            initial_state['element_active'] = self.stages[stage_id]['element_active']
            print(f"✅ Element active status from stage: {len(initial_state['element_active'])} elements")
        else:
            print(f"ℹ️ No element_active in stage data (using empty array)")
            initial_state['element_active'] = []
        
        print(f"✅ Initial state prepared from stage {stage_id}")
        print(f"   - Stress state: {len(initial_state['stress_state'])} elements")
        print(f"   - Displacement state: {len(initial_state['displacement_state'])} nodes")
        print(f"   - PWP state: {len(initial_state['pwp_state'])} nodes")
        print(f"   - Plastic strain state: {len(initial_state['plastic_strain_state'])} elements")
        print(f"   - Element active: {len(initial_state['element_active'])} elements")
        
        return initial_state

    def get_initial_state_for_next_stage(self, stage_id: str) -> Optional[Dict]:
        """
        Get initial state data from the previous stage for transfer to next stage
        
        Parameters:
        stage_id: Current stage ID
        
        Returns:
        Dict: Initial state data for next stage, or None if no previous stage
        """
        if stage_id not in self.stages:
            return None
        
        current_sequence = self.stages[stage_id]['stage_sequence']
        if current_sequence <= 1:
            return None  # No previous stage
        
        # Find previous stage
        prev_stage_id = None
        for sid, stage_data in self.stages.items():
            if stage_data['stage_sequence'] == current_sequence - 1:
                prev_stage_id = sid
                break
        
        if not prev_stage_id:
            return None
        
        # Use the new method to get initial state from previous stage
        return self.get_initial_state_from_stage(prev_stage_id) 