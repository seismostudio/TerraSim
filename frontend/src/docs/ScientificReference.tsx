import React from 'react';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import { Book } from 'lucide-react';

export const ScientificReference: React.FC = () => {
    return (
        <div className="space-y-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <header className="space-y-4">
                <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight leading-tight">
                    Scientific Reference
                </h1>
                <p className="text-xl text-slate-400 leading-relaxed max-w-2xl">
                    Detailed mathematical formulation and theoretical background of the TerraSim FEM engine.
                </p>
            </header>

            <nav className="flex flex-wrap gap-4 border-b border-slate-800 pb-8">
                {['General Formulation', 'Material Models', 'Staged Construction', 'Pore Pressure'].map((topic) => (
                    <button key={topic} className="px-4 py-2 rounded-full bg-slate-900 border border-slate-700 text-sm font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition-all">
                        {topic}
                    </button>
                ))}
            </nav>

            {/* General Formulation */}
            <section className="space-y-8">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-600/20">
                        <span className="text-white font-bold">1</span>
                    </div>
                    <h2 className="text-3xl font-black text-white">General FEM Formulation</h2>
                </div>

                <div className="prose prose-invert max-w-none space-y-6">
                    <p className="text-slate-300 leading-relaxed">
                        TerraSim uses a displacement-based Finite Element Method (FEM) using Constant Strain Triangles (CST).
                        The fundamental equilibrium equation in a discrete system is expressed as:
                    </p>
                    <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex justify-center items-center overflow-x-auto">
                        <BlockMath math={"[K]\{u\} = \{F\}"} />
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                        Where <InlineMath math={"[K]"} /> is the global stiffness matrix, <InlineMath math={"\{u\}"} /> is the global displacement vector, and <InlineMath math={"\{F\}"} /> is the global load vector.
                    </p>

                    <h3 className="text-xl font-bold text-white mt-8">Element Stiffness Matrix</h3>
                    <p className="text-slate-300 leading-relaxed">
                        For each Constant Strain Triangle (CST) element, the stiffness matrix is calculated as:
                    </p>
                    <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex justify-center items-center overflow-x-auto">
                        <BlockMath math={"[k]_e = \int_V [B]^T [D] [B] dV"} />
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                        In 2D plane strain conditions, this simplifies to:
                    </p>
                    <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex justify-center items-center overflow-x-auto">
                        <BlockMath math={"[k]_e = [B]^T [D] [B] \cdot t \cdot A"} />
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                        Where:
                    </p>
                    <ul className="grid sm:grid-cols-2 gap-4 list-none p-0">
                        <li className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/50 flex items-center gap-3">
                            <span className="text-blue-400 font-mono text-sm">[B]</span>
                            <span className="text-slate-400 text-xs text-xs">Strain-Displacement Matrix</span>
                        </li>
                        <li className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/50 flex items-center gap-3">
                            <span className="text-blue-400 font-mono text-sm">[D]</span>
                            <span className="text-slate-400 text-xs">Constitutive (Material) Matrix</span>
                        </li>
                        <li className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/50 flex items-center gap-3">
                            <span className="text-blue-400 font-mono text-sm">A</span>
                            <span className="text-slate-400 text-xs text-xs">Area of the triangle</span>
                        </li>
                        <li className="bg-slate-900/40 p-3 rounded-lg border border-slate-800/50 flex items-center gap-3">
                            <span className="text-blue-400 font-mono text-sm">t</span>
                            <span className="text-slate-400 text-xs">Thickness (assumed 1.0 for plane strain)</span>
                        </li>
                    </ul>
                </div>
            </section>

            {/* Material Models */}
            <section className="space-y-8 pt-12 border-t border-slate-800">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/20">
                        <span className="text-white font-bold">2</span>
                    </div>
                    <h2 className="text-3xl font-black text-white">Material Constitutive Models</h2>
                </div>

                <div className="space-y-6">
                    <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 space-y-4">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            Mohr-Coulomb (Elastic-Plastic)
                        </h3>
                        <p className="text-slate-400 leading-relaxed">
                            The Mohr-Coulomb model is the standard for soil mechanics. It defines failure as a linear relationship between normal stress and shear stress:
                        </p>
                        <div className="flex justify-center py-6">
                            <BlockMath math={"\\tau = c' + \\sigma' \\tan \\phi'"} />
                        </div>
                        <p className="text-slate-500 text-sm italic border-l-2 border-emerald-500/30 pl-4">
                            TerraSim implements this using a non-associated plastic flow rule to account for soil dilation/contraction.
                        </p>
                    </div>

                    <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 space-y-4">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full bg-blue-500" />
                            Linear Elastic
                        </h3>
                        <p className="text-slate-400 leading-relaxed">
                            Based on Hooke's Law for isotropic materials. The stress-strain relationship is governed by Young's Modulus (E) and Poisson's Ratio <InlineMath math={"(\\nu)"} />.
                        </p>
                        <div className="flex justify-center py-6">
                            <BlockMath math={"\\sigma_{ij} = \\lambda \\delta_{ij} \\epsilon_{kk} + 2\\mu \\epsilon_{ij}"} />
                        </div>
                    </div>
                </div>
            </section>

            {/* Pore Water Pressure */}
            <section className="space-y-8 pt-12 border-t border-slate-800">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-400 flex items-center justify-center shadow-lg shadow-blue-400/20 text-slate-950">
                        <span className="font-bold">3</span>
                    </div>
                    <h2 className="text-3xl font-black text-white">Pore Water Pressure (PWP)</h2>
                </div>

                <div className="prose prose-invert max-w-none space-y-4">
                    <p className="text-slate-300 leading-relaxed">
                        TerraSim calculates Phreatic/Steady-state Pore Water Pressure based on the defined active water level.
                        Effective stress <InlineMath math={"(\\sigma')"} /> is derived using Terzaghi's principle:
                    </p>
                    <div className="bg-slate-900/50 p-6 rounded-2xl border border-slate-800 flex justify-center items-center">
                        <BlockMath math={"\\sigma' = \\sigma - u"} />
                    </div>
                    <p className="text-slate-300 leading-relaxed">
                        Where <InlineMath math={"u"} /> is the pore water pressure, calculated as <InlineMath math={"u = \\gamma_w \\cdot h_w"} />.
                    </p>
                </div>
            </section>

            {/* References */}
            <section className="space-y-8 pt-12 border-t border-slate-800">
                <h2 className="text-2xl font-bold text-white">Literature & References</h2>
                <div className="grid sm:grid-cols-1 gap-4">
                    {[
                        { title: "The Finite Element Method: Its Basis and Fundamentals", author: "Zienkiewicz, O.C. & Taylor, R.L.", source: "Elsevier Science (2013)" },
                        { title: "Advanced Geotechnical Engineering: Soil-Structure Interaction using Computer and Material Models", author: "Desai, C.S. & Zaman, M.", source: "CRC Press (2013)" },
                        { title: "Finite Element Analysis in Geotechnical Engineering: Application", author: "Potts, D.M. & Zdravkovic, L.", source: "Thomas Telford (2001)" }
                    ].map((ref, idx) => (
                        <div key={idx} className="flex gap-4 p-4 rounded-2xl bg-slate-900/30 border border-slate-800 items-start group hover:bg-slate-800/30 transition-colors">
                            <div className="p-2 bg-slate-800 rounded-lg text-slate-500 group-hover:text-blue-400 transition-colors">
                                <Book className="w-5 h-5" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-white">{ref.title}</h4>
                                <p className="text-xs text-slate-500 mt-1">{ref.author} &bull; {ref.source}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
};
