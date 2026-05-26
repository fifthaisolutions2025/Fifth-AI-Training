import React, { useState, useEffect } from "react";
import { Case, CaseAnalysis } from "../types";
import { 
  Plus, Trash2, Calendar, MapPin, Sparkles, AlertCircle, 
  Loader2, Activity, ShieldCheck, Clock, FileCheck, CheckCircle2, ChevronRight, BookmarkPlus, HelpCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface DashboardProps {
  onSelectCase: (c: Case) => void;
  selectedCase: Case | null;
  onChecklistRequest: (formType: string) => void;
  onLetterRequest: (c: Case) => void;
}

export default function Dashboard({ onSelectCase, selectedCase, onChecklistRequest, onLetterRequest }: DashboardProps) {
  const [cases, setCases] = useState<Case[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form input states
  const [receiptNumber, setReceiptNumber] = useState("");
  const [formType, setFormType] = useState("I-485");
  const [title, setTitle] = useState("");
  const [filedDate, setFiledDate] = useState("");
  const [center, setCenter] = useState("");
  const [country, setCountry] = useState("India");
  const [notes, setNotes] = useState("");

  const [validationError, setValidationError] = useState("");
  const [analysis, setAnalysis] = useState<CaseAnalysis | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  const [analysisError, setAnalysisError] = useState("");

  // Load cases from local storage on mount
  useEffect(() => {
    const saved = localStorage.getItem("uscis_cases");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCases(parsed);
        if (parsed.length > 0 && !selectedCase) {
          onSelectCase(parsed[0]);
        }
      } catch (e) {
        console.error("Error parsing saved cases", e);
      }
    } else {
      // Seed initial sample cases to make workspace experience instantly pleasing
      const sampleCases: Case[] = [
        {
          id: "sample-1",
          receiptNumber: "IOE9872134567",
          formType: "I-485",
          title: "My Green Card Adjust Application",
          filedDate: "2025-10-15",
          center: "National Benefit Center (NBC)",
          country: "India",
          notes: "Approved Medical exam concurrently filed.",
          lastUpdated: new Date().toISOString()
        },
        {
          id: "sample-2",
          receiptNumber: "LIN2690184231",
          formType: "I-140",
          title: "EB-2 NIW Petition",
          filedDate: "2026-02-10",
          center: "Nebraska Service Center",
          country: "United Kingdom",
          notes: "Evaluating premium processing options.",
          lastUpdated: new Date().toISOString()
        }
      ];
      setCases(sampleCases);
      localStorage.setItem("uscis_cases", JSON.stringify(sampleCases));
      onSelectCase(sampleCases[0]);
    }
  }, []);

  // Sync to local storage when cases change
  const saveCases = (updated: Case[]) => {
    setCases(updated);
    localStorage.setItem("uscis_cases", JSON.stringify(updated));
  };

  // Trigger automated case analysis whenever selected case changes
  useEffect(() => {
    if (selectedCase) {
      analyzeCase(selectedCase);
    } else {
      setAnalysis(null);
    }
  }, [selectedCase]);

  const analyzeCase = async (c: Case) => {
    setIsLoadingAnalysis(true);
    setAnalysisError("");
    try {
      const response = await fetch("/api/uscis/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiptNumber: c.receiptNumber,
          formType: c.formType,
          filedDate: c.filedDate,
          center: c.center,
          country: c.country
        })
      });

      if (!response.ok) {
        throw new Error("Unable to analyze this receipt code.");
      }
      
      const data = await response.json();
      setAnalysis(data);
    } catch (e: any) {
      setAnalysisError(e.message || "Something went wrong.");
    } finally {
      setIsLoadingAnalysis(false);
    }
  };

  // Clear states
  const resetForm = () => {
    setReceiptNumber("");
    setFormType("I-485");
    setTitle("");
    setFiledDate("");
    setCenter("");
    setCountry("India");
    setNotes("");
    setValidationError("");
  };

  // Add Case Submission Handler
  const handleAddCase = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError("");

    // Minimal receipt structures: either empty or matching standard USCIS (3 letters + 10 digits)
    const cleanReceipt = receiptNumber.trim().toUpperCase();
    if (cleanReceipt) {
      const isValid = /^[A-Z]{3}\d{10}$/.test(cleanReceipt);
      if (!isValid) {
        setValidationError("USCIS Receipt Numbers are precisely 13 characters. (e.g., LIN2490184123 or IOE0987153421). Leave empty if not yet received.");
        return;
      }
    }

    if (!filedDate) {
      setValidationError("A valid original filing date is required to trigger estimated milestones.");
      return;
    }

    const newCase: Case = {
      id: "case-" + Date.now(),
      receiptNumber: cleanReceipt || "PENDING-RECPT",
      formType,
      title: title.trim() || `${formType} Application`,
      filedDate,
      center: center.trim() || "National Benefit Center (NBC)",
      country,
      notes: notes.trim(),
      lastUpdated: new Date().toISOString()
    };

    const updated = [...cases, newCase];
    saveCases(updated);
    onSelectCase(newCase);
    resetForm();
    setShowAddForm(false);
  };

  // Delete Case Handler
  const handleDeleteCase = (caseId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    if (confirm("Are you sure you want to delete this visa tracking case files?")) {
      const updated = cases.filter(c => c.id !== caseId);
      saveCases(updated);
      if (selectedCase && selectedCase.id === caseId) {
        if (updated.length > 0) {
          onSelectCase(updated[0]);
        } else {
          onSelectCase(null);
        }
      }
    }
  };

  // Quick Inline Notes Update
  const handleSaveNotes = (val: string) => {
    if (!selectedCase) return;
    const updated = cases.map(c => {
      if (c.id === selectedCase.id) {
        return { ...c, notes: val, lastUpdated: new Date().toISOString() };
      }
      return c;
    });
    saveCases(updated);
    onSelectCase({ ...selectedCase, notes: val });
  };

  const formTypesGuide = [
    { code: "I-485", name: "Register Permanent Residence / Adjust Status" },
    { code: "I-140", name: "Immigrant Petition for Alien Workers" },
    { code: "I-130", name: "Petition for Alien Relative (Spouse/Family)" },
    { code: "I-765", name: "Application for Employment Authorization (EAD)" },
    { code: "I-131", name: "Application for Travel Document (Advance Parole)" },
    { code: "I-539", name: "Extend/Change Nonimmigrant Status" },
    { code: "N-400", name: "Application for Naturalization (Citizenship)" },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      
      {/* LEFT COLUMN: Case management & Selector */}
      <div className="lg:col-span-4 space-y-6">
        
        {/* Header Widget */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 font-display">My Tracking Cases</h2>
              <p className="text-xs text-slate-500 font-mono">Total tracked: {cases.length}</p>
            </div>
            
            <button
              id="add-case-btn"
              onClick={() => {
                setShowAddForm(!showAddForm);
                if (!showAddForm) resetForm();
              }}
              className="flex items-center gap-1 bg-brand-600 hover:bg-brand-700 text-white text-xs px-3 py-2 rounded-xl transition duration-200 cursor-pointer text-center font-medium shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Add Application</span>
            </button>
          </div>

          {/* ADD APPLICATION WIDGET FORM */}
          <AnimatePresence>
            {showAddForm && (
              <motion.form
                id="add-case-form"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handleAddCase}
                className="overflow-hidden border-t border-slate-100 pt-4 mt-3 space-y-3"
              >
                <div className="text-sm font-semibold text-slate-800">New Immigration Application</div>
                
                {validationError && (
                  <div className="bg-red-50 text-red-600 text-xs p-2.5 rounded-lg flex items-center gap-2 font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{validationError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs text-slate-500 font-medium mb-1">Receipt Number (Optional)</label>
                  <input
                    id="input-receipt-number"
                    type="text"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder="e.g. LIN2690184123"
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 uppercase tracking-widest font-mono"
                  />
                  <p className="text-[10px] text-slate-400 mt-1">Leave empty if application was just submitted.</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 font-medium mb-1">Form Type</label>
                    <select
                      id="select-form-type"
                      value={formType}
                      onChange={(e) => setFormType(e.target.value)}
                      className="w-full text-xs px-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white"
                    >
                      {formTypesGuide.map((item) => (
                        <option key={item.code} value={item.code}>{item.code}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-xs text-slate-500 font-medium mb-1">Application Label</label>
                    <input
                      id="input-case-title"
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. My Green Card"
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-500 font-medium mb-1">Date Filed</label>
                    <input
                      id="input-filed-date"
                      type="date"
                      value={filedDate}
                      onChange={(e) => setFiledDate(e.target.value)}
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 text-slate-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 font-medium mb-1">Country Chargeability</label>
                    <select
                      id="select-country"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full text-xs px-2 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white"
                    >
                      <option value="India">India</option>
                      <option value="China">China</option>
                      <option value="Mexico">Mexico</option>
                      <option value="Philippines">Philippines</option>
                      <option value="United Kingdom">United Kingdom</option>
                      <option value="Canada">Canada</option>
                      <option value="Worldwide">Worldwide (Other)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-slate-500 font-medium mb-1">Processing Office / Office Center</label>
                  <input
                    id="input-office-center"
                    type="text"
                    value={center}
                    onChange={(e) => setCenter(e.target.value)}
                    placeholder="e.g. National Benefit Center"
                    className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    id="cancel-add-case"
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="w-1/2 text-xs py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg cursor-pointer font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    id="submit-add-case"
                    type="submit"
                    className="w-1/2 text-xs py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg cursor-pointer font-medium"
                  >
                    Save Case
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>

        {/* APPLICATIONS LIST */}
        <div className="space-y-3">
          {cases.length === 0 ? (
            <div className="text-center p-8 bg-white rounded-2xl border border-dashed border-slate-200">
              <Plus className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <div className="text-sm font-semibold text-slate-800">No Tracked Applications</div>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">Create checklists, draft legal expediting cover letters, and track USCIS milestones instantly by hitting the Add button above.</p>
            </div>
          ) : (
            cases.map((c) => {
              const isActive = selectedCase && selectedCase.id === c.id;
              return (
                <div
                  id={`case-card-${c.id}`}
                  key={c.id}
                  onClick={() => onSelectCase(c)}
                  className={`p-4 rounded-xl border transition-all duration-300 cursor-pointer relative group ${
                    isActive
                      ? "bg-brand-900 text-white border-brand-900 shadow-md"
                      : "bg-white text-slate-800 border-slate-100 hover:border-slate-300 shadow-sm"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                        isActive ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-700"
                      }`}>
                        {c.formType}
                      </span>
                      <h3 className={`text-sm font-semibold tracking-tight mt-1 font-display ${isActive ? "text-white" : "text-slate-800"}`}>
                        {c.title}
                      </h3>
                    </div>

                    <button
                      id={`delete-case-${c.id}`}
                      onClick={(e) => handleDeleteCase(c.id, e)}
                      className={`opacity-0 group-hover:opacity-100 p-1.5 rounded-lg transition-opacity ${
                        isActive ? "hover:bg-brand-800 text-brand-300 hover:text-white" : "hover:bg-red-50 text-slate-400 hover:text-red-500"
                      }`}
                      title="Remove Case"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-400 mt-3 font-mono">
                    <div className="flex items-center gap-1 shrink-0">
                      <Clock className="w-3.5 h-3.5 opacity-70" />
                      <span>Filed {c.filedDate}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <MapPin className="w-3.5 h-3.5 opacity-70" />
                      <span className="truncate max-w-[120px]">{c.receiptNumber}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: Case Analysis & USCIS Details */}
      <div className="lg:col-span-8">
        {!selectedCase ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm flex flex-col items-center justify-center min-h-[500px]">
            <Activity className="w-12 h-12 text-slate-300 animate-pulse mb-3" />
            <h3 className="text-lg font-bold text-slate-700 font-display">No Case Selected</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">Please select an existing USCIS application file from the sidebar, or create a new one to begin tracking real-time details.</p>
          </div>
        ) : (
          <div className="space-y-6">

            {/* Quick Actions Portal Banner */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm flex flex-wrap justify-between items-center gap-4">
              <div className="space-y-1">
                <div className="text-xs uppercase font-mono font-medium text-slate-400">Quick Access Tools</div>
                <div className="text-sm font-bold text-slate-800 font-display">AI Form Tools available for Case: {selectedCase.title}</div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  id="action-view-checklist"
                  onClick={() => onChecklistRequest(selectedCase.formType)}
                  className="bg-brand-50 hover:bg-brand-100 text-brand-700 text-xs font-semibold px-4 py-2.5 rounded-xl border border-brand-200/50 transition cursor-pointer"
                >
                  <FileCheck className="w-4 h-4 inline-block mr-1.5" />
                  View Needed Checklist
                </button>
                <button
                  id="action-draft-letter"
                  onClick={() => onLetterRequest(selectedCase)}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold px-4 py-2.5 rounded-xl border border-emerald-200 transition cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 inline-block mr-1.5 text-emerald-600" />
                  Draft Letter Template
                </button>
              </div>
            </div>

            {/* PRIMARY STATUS BLOCK */}
            <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm relative overflow-hidden">
              {isLoadingAnalysis && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center">
                  <Loader2 className="w-10 h-10 text-brand-600 animate-spin mb-2" />
                  <div className="text-sm font-medium text-slate-700">Analyzing tracking metrics using Gemini AI...</div>
                  <p className="text-xs text-slate-400 mt-1">Sourcing structural timeline frameworks</p>
                </div>
              )}

              {analysisError && (
                <div className="p-4 bg-red-50 text-red-600 rounded-xl border border-red-200/50 flex flex-col items-start gap-2">
                  <div className="flex items-center gap-2 font-semibold text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 animate-bounce" />
                    <span>Failed to obtain active case review context</span>
                  </div>
                  <p className="text-xs text-slate-500">{analysisError}</p>
                  <button 
                    onClick={() => analyzeCase(selectedCase)}
                    className="mt-2 text-xs text-white bg-red-600 px-3 py-1.5 rounded-lg hover:bg-red-700 transition"
                  >
                    Retro Retry
                  </button>
                </div>
              )}

              {analysis && (
                <div className="space-y-6">
                  {/* Status Grid info header */}
                  <div className="flex flex-wrap justify-between items-start gap-4 border-b border-slate-50 pb-5">
                    <div>
                      <span className="text-[10px] text-slate-400 font-mono font-semibold uppercase tracking-wider block">CURRENT STEP STATUS</span>
                      <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight font-display mt-1">
                        {analysis.currentEstimatedStatus}
                      </h2>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-2 font-mono">
                        <span className="bg-slate-100 px-2 py-1 rounded-md text-[11px] font-semibold">{analysis.processingCenter}</span>
                        <span>•</span>
                        <span>{analysis.daysFiledToNow} Days Pending</span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-mono font-semibold uppercase tracking-wider block">ESTIMATED RESOLUTION</span>
                      <div className="text-lg font-bold text-slate-800 font-display mt-1">
                        {analysis.estimatedDecisionDate}
                      </div>
                      <span className="text-xs text-slate-400">Total Avg: {analysis.estimatedOverallTimeMonths} Months</span>
                    </div>
                  </div>

                  {/* Progress Indicator */}
                  <div>
                    <div className="flex justify-between items-center mb-1.5">
                      <span className="text-xs font-semibold text-slate-600">Calculated Case Progress</span>
                      <span className="text-xs font-mono font-bold text-slate-950 bg-slate-100 px-1.5 py-0.5 rounded">{analysis.progressPercentage}%</span>
                    </div>
                    <div className="w-full bg-slate-100 h-3 rounded-full overflow-hidden">
                      <div 
                        className="bg-brand-600 h-full rounded-full transition-all duration-1000"
                        style={{ width: `${analysis.progressPercentage}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Receipt Format validation report */}
                  {analysis.receiptValidation && selectedCase.receiptNumber !== "PENDING-RECPT" && (
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex gap-3 items-start">
                      <ShieldCheck className="w-5 h-5 text-brand-600 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-xs font-bold text-slate-800">Receipt Syntax Check: {selectedCase.receiptNumber}</div>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          {analysis.receiptValidation.isValidFormat 
                            ? `Valid format detected (Prefix ${analysis.receiptValidation.prefixCode} represent ${analysis.receiptValidation.prefixOfficeDetails}).`
                            : "Standard format unrecognized. Double check if receipt is exactly 13 alphanumeric chars (3 letters + 10 digits)."}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* TIMELINE MILESTONES */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 font-display mb-4">Milestone Flowchart</h3>
                    <div className="relative border-l border-slate-200 ml-3.5 space-y-6">
                      {analysis.historicalMilestones?.map((milestone, idx) => {
                        const isCompleted = milestone.status === "completed";
                        const isActive = milestone.status === "active";
                        
                        return (
                          <div key={idx} className="relative pl-6">
                            {/* Dot indicator */}
                            <span className={`absolute -left-3.5 top-1.5 w-7 h-7 rounded-full flex items-center justify-center border-4 ${
                              isCompleted 
                                ? "bg-emerald-500 border-emerald-50 text-white"
                                : isActive
                                  ? "bg-brand-600 border-brand-50 text-white animate-pulse"
                                  : "bg-slate-200 border-white text-slate-400"
                            }`}>
                              {isCompleted ? (
                                <CheckCircle2 className="w-4 h-4 shrink-0" />
                              ) : (
                                <span className="text-[10px] font-bold font-mono">{idx + 1}</span>
                              )}
                            </span>

                            <div>
                              <div className="flex justify-between items-center">
                                <h4 className={`text-xs font-bold ${isCompleted ? "text-slate-700" : isActive ? "text-brand-950" : "text-slate-400"}`}>
                                  {milestone.step}
                                </h4>
                                <span className="text-[10px] font-mono text-slate-400">{milestone.date}</span>
                              </div>
                              <p className="text-xs text-slate-400 mt-1 leading-relaxed">{milestone.description}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* AI POWERED SECTION */}
                  <div className="bg-brand-50 p-5 rounded-2xl border border-brand-100/50 space-y-3.5">
                    <div className="flex items-center gap-1.5">
                      <Sparkles className="w-5 h-5 text-brand-600" />
                      <h3 className="text-sm font-bold text-brand-950 font-display">Data-Driven AI USCIS Analysis</h3>
                    </div>
                    
                    <ul className="space-y-2 text-xs text-brand-900 leading-relaxed list-disc list-inside pl-1">
                      {analysis.customInsights?.map((insight, idx) => (
                        <li key={idx} className="pl-1 text-slate-600">{insight}</li>
                      ))}
                    </ul>

                    {analysis.actionsToTake && analysis.actionsToTake.length > 0 && (
                      <div className="pt-2 border-t border-brand-100/40">
                        <div className="text-xs font-bold text-brand-950 mb-2">Recommended Actions:</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {analysis.actionsToTake.map((action, key) => (
                            <div key={key} className="bg-white/60 p-2.5 rounded-lg text-xs border border-brand-100">
                              <span className="font-bold text-brand-900 block mb-0.5">{action.title}</span>
                              <span className="text-slate-500 text-[11px] font-medium leading-relaxed">{action.description}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              )}
            </div>

            {/* INLINE CASE NOTES AND ANNOTATIONS */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-800 font-display mb-2">Case Specific Notes & Annotations</h3>
              <p className="text-xs text-slate-400 mb-3">Keep logs of response letters, medical certifications, RFE deliveries, or appointments scheduled locally in your browser.</p>
              <textarea
                id="notes-textarea"
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  handleSaveNotes(e.target.value);
                }}
                placeholder="Type your notes here... (e.g. Completed biometrics at Seattle Field Office. Expedite request faxed on 5/12)"
                rows={3}
                className="w-full text-xs p-3 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 font-sans leading-relaxed"
                onFocus={() => setNotes(selectedCase.notes || "")}
                defaultValue={selectedCase.notes || ""}
              />
              <div className="flex justify-between items-center mt-2">
                <span className="text-[10px] text-slate-400 font-mono">Autosaved to Local Storage</span>
                <span className="text-[10px] text-slate-400 font-mono">Last modified: {new Date(selectedCase.lastUpdated).toLocaleString()}</span>
              </div>
            </div>

          </div>
        )}
      </div>

    </div>
  );
}
