import React, { useState, useEffect, useRef } from "react";
import Dashboard from "./components/Dashboard";
import { Case, FormChecklist, ChecklistSection, ChecklistItem } from "./types";
import { 
  Building2, HelpCircle, FileText, CheckSquare, MessageSquare, AlertCircle, 
  MapPin, ShieldAlert, Sparkles, Check, Copy, ArrowDownToLine, Send, Loader2, RotateCcw, Award, Globe
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  const [activeTab, setActiveTab] = useState<"dashboard" | "checklist" | "letters" | "chat">("dashboard");
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);

  // Checklist view state
  const [checklistForm, setChecklistForm] = useState("I-485");
  const [checklistData, setChecklistData] = useState<FormChecklist | null>(null);
  const [isLoadingChecklist, setIsLoadingChecklist] = useState(false);
  const [checklistCompletions, setChecklistCompletions] = useState<Record<string, boolean>>({});

  // Letter Generator view state
  const [letterCaseId, setLetterCaseId] = useState<string>("custom");
  const [letterFormType, setLetterFormType] = useState("I-485");
  const [letterType, setLetterType] = useState("cover");
  const [expeditingReasons, setExpeditingReasons] = useState("");
  const [applicantDetails, setApplicantDetails] = useState("");
  const [draftedLetter, setDraftedLetter] = useState("");
  const [isLoadingLetter, setIsLoadingLetter] = useState(false);
  const [copiedLetter, setCopiedLetter] = useState(false);

  // Chatbot view state
  const [chatMessage, setChatMessage] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "bot"; content: string }>>([
    { role: "bot", content: "### USCIS Advisory Companion\n\nHello! I am your AI assistant specialized in U.S. Immigration and Visa filings. How can I assist you with your USCIS timeline, documents, or regulations today?" }
  ]);
  const [isLoadingChat, setIsLoadingChat] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Live total app cases counter for navigation indicators
  const [casesCount, setCasesCount] = useState(0);

  useEffect(() => {
    // Determine number of existing cases
    const saved = localStorage.getItem("uscis_cases");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCasesCount(parsed.length);
      } catch (e) {
        setCasesCount(0);
      }
    } else {
      setCasesCount(2); // Seed default has 2 cases
    }
  }, [selectedCase, activeTab]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistory, isLoadingChat]);

  // Handle route triggers from Dashboard component
  const handleChecklistRequest = (formType: string) => {
    setChecklistForm(formType);
    setActiveTab("checklist");
    fetchChecklist(formType);
  };

  const handleLetterRequest = (c: Case) => {
    setLetterCaseId(c.id);
    setLetterFormType(c.formType);
    setApplicantDetails(`Applicant: ${c.title}\nReceipt Number: ${c.receiptNumber}\nProcessing Location: ${c.center}\nCountry: ${c.country}`);
    setActiveTab("letters");
  };

  // Fetch or retrieve Checklist API details
  const fetchChecklist = async (form: string) => {
    setIsLoadingChecklist(true);
    try {
      const response = await fetch("/api/uscis/checklist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formType: form })
      });
      if (response.ok) {
        const data = await response.json();
        setChecklistData(data);
        
        // Load checkbox states from local storage
        const savedChecks = localStorage.getItem(`uscis_check_vids_${form}`);
        if (savedChecks) {
          setChecklistCompletions(JSON.parse(savedChecks));
        } else {
          setChecklistCompletions({});
        }
      }
    } catch (e) {
      console.error("Error creating checklist", e);
    } finally {
      setIsLoadingChecklist(false);
    }
  };

  useEffect(() => {
    if (activeTab === "checklist" && !checklistData) {
      fetchChecklist(checklistForm);
    }
  }, [activeTab, checklistForm]);

  const toggleChecklistItem = (itemKey: string) => {
    const updated = {
      ...checklistCompletions,
      [itemKey]: !checklistCompletions[itemKey]
    };
    setChecklistCompletions(updated);
    localStorage.setItem(`uscis_check_vids_${checklistForm}`, JSON.stringify(updated));
  };

  // Generate Letter Handler
  const handleGenerateLetter = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingLetter(true);
    setDraftedLetter("");
    try {
      const response = await fetch("/api/uscis/draft-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formType: letterFormType,
          letterType,
          expeditingReasons,
          personalDetails: applicantDetails
        })
      });
      if (response.ok) {
        const data = await response.json();
        setDraftedLetter(data.letter);
      } else {
        setDraftedLetter("Failed to draft letter. Please verify network access.");
      }
    } catch (err) {
      setDraftedLetter("Error crafting document. Ensure server-side services are active.");
    } finally {
      setIsLoadingLetter(false);
    }
  };

  // Copy to clipboard helper
  const handleCopyLetter = () => {
    navigator.clipboard.writeText(draftedLetter);
    setCopiedLetter(true);
    setTimeout(() => setCopiedLetter(false), 2000);
  };

  // Download Letter helper
  const handleDownloadLetter = () => {
    const element = document.createElement("a");
    const file = new Blob([draftedLetter], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `USCIS_Draft_${letterFormType}_${letterType}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  // Send message to advisory chatbot
  const handleSendChatMessage = async (e?: React.FormEvent, customMsg?: string) => {
    if (e) e.preventDefault();
    const msgToSend = customMsg || chatMessage;
    if (!msgToSend.trim()) return;

    const userEntry = { role: "user" as const, content: msgToSend };
    setChatHistory(prev => [...prev, userEntry]);
    setChatMessage("");
    setIsLoadingChat(true);

    try {
      const historyPayload = chatHistory.slice(-6).map(h => ({
        role: h.role,
        content: h.content
      }));

      const response = await fetch("/api/uscis/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msgToSend,
          history: historyPayload
        })
      });

      if (response.ok) {
        const data = await response.json();
        setChatHistory(prev => [...prev, { role: "bot", content: data.reply }]);
      } else {
        setChatHistory(prev => [...prev, { role: "bot", content: "I'm having trouble connecting to the immigration servers. Please try again." }]);
      }
    } catch (err) {
      setChatHistory(prev => [...prev, { role: "bot", content: "Error contacting advisor. Please check integration settings." }]);
    } finally {
      setIsLoadingChat(true);
      setIsLoadingChat(false);
    }
  };

  // Simple clean markdown viewer parser
  const renderMarkdown = (text: string) => {
    if (!text) return null;
    return text.split("\n").map((line, idx) => {
      // Headers
      if (line.startsWith("### ")) {
        return <h4 key={idx} className="text-sm font-bold text-slate-800 tracking-tight mt-4 mb-2 font-display">{line.replace("### ", "")}</h4>;
      }
      if (line.startsWith("## ")) {
        return <h3 key={idx} className="text-base font-bold text-[#003366] mt-5 mb-2.5 font-display border-b border-slate-100 pb-1">{line.replace("## ", "")}</h3>;
      }
      if (line.startsWith("# ")) {
        return <h2 key={idx} className="text-lg font-bold text-[#003366] mt-6 mb-3 font-display uppercase tracking-wide">{line.replace("# ", "")}</h2>;
      }
      // Lists
      if (line.startsWith("* ") || line.startsWith("- ")) {
        return (
          <li key={idx} className="text-xs text-slate-600 ml-4 list-disc pl-1 py-0.5 leading-relaxed">
            {line.replace(/^[\*\-]\s+/, "")}
          </li>
        );
      }
      if (/^\d+\.\s+/.test(line)) {
        return (
          <li key={idx} className="text-xs text-slate-600 ml-4 list-decimal pl-1 py-0.5 leading-relaxed">
            {line.replace(/^\d+\.\s+/, "")}
          </li>
        );
      }
      // Bold rendering inside paragraph
      if (line.trim() === "") return <div key={idx} className="h-2" />;
      
      // Simple bold highlights replacement
      const parts = line.split(/\*\*([^*]+)\*\*/g);
      return (
        <p key={idx} className="text-xs text-slate-600 leading-relaxed mb-2.5">
          {parts.map((part, pIdx) => (pIdx % 2 === 1 ? <strong key={pIdx} className="font-semibold text-slate-900">{part}</strong> : part))}
        </p>
      );
    });
  };

  return (
    <div id="app-root" className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-900">
      
      {/* PROFESSIONAL POLISH USCIS OFFICAL DESIGN HEADER */}
      <header className="bg-[#003366] text-white px-6 py-4 flex flex-col sm:flex-row justify-between items-center shadow-md shrink-0 border-b-4 border-[#c2d5eb]">
        <div className="flex items-center gap-3.5 mb-3 sm:mb-0">
          <div className="w-10 h-10 bg-white rounded flex items-center justify-center border-2 border-[#fff]/40 shadow-inner">
            <Building2 className="text-[#003366] w-6 h-6" />
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight uppercase tracking-wider font-display shrink-0">
              U.S. Citizenship and Immigration Services
            </h1>
            <p className="text-[10px] text-brand-100 opacity-90 uppercase tracking-widest font-semibold flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Official Case Status Tracking & AI Advisory
            </p>
          </div>
        </div>

        {/* Dynamic Navigation matching theme layout */}
        <nav className="flex flex-wrap gap-2 md:gap-4 text-xs font-semibold">
          <button
            id="nav-dashboard"
            onClick={() => setActiveTab("dashboard")}
            className={`cursor-pointer px-3 py-1.5 rounded-lg transition duration-200 ${
              activeTab === "dashboard" ? "bg-[#fff]/10 text-white border-b-2 border-white pb-1" : "text-blue-100 opacity-75 hover:opacity-100"
            }`}
          >
            My Dashboard
          </button>
          
          <button
            id="nav-checklist"
            onClick={() => {
              setActiveTab("checklist");
              if (!checklistData) fetchChecklist(checklistForm);
            }}
            className={`cursor-pointer px-3 py-1.5 rounded-lg transition duration-200 ${
              activeTab === "checklist" ? "bg-[#fff]/10 text-white border-b-2 border-white pb-1" : "text-blue-100 opacity-75 hover:opacity-100"
            }`}
          >
            Document Checklist
          </button>

          <button
            id="nav-letters"
            onClick={() => setActiveTab("letters")}
            className={`cursor-pointer px-3 py-1.5 rounded-lg transition duration-200 ${
              activeTab === "letters" ? "bg-[#fff]/10 text-white border-b-2 border-white pb-1" : "text-blue-100 opacity-75 hover:opacity-100"
            }`}
          >
            Letter Generator
          </button>

          <button
            id="nav-chat"
            onClick={() => setActiveTab("chat")}
            className={`cursor-pointer px-3 py-1.5 rounded-lg transition duration-200 ${
              activeTab === "chat" ? "bg-[#fff]/10 text-white border-b-2 border-white pb-1" : "text-blue-100 opacity-75 hover:opacity-100"
            }`}
          >
            Advisory Chat
          </button>
        </nav>

        {/* Profile Card component */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs font-bold leading-none tracking-tight">IMMIGRANT PORTAL</p>
            <p className="text-[9px] text-blue-200 opacity-80 mt-1 font-mono">ID: USCIS-882-941</p>
          </div>
          <div className="w-8 h-8 bg-brand-400 rounded-full flex items-center justify-center text-xs text-white font-extrabold border border-white/20 uppercase">
            IO
          </div>
        </div>
      </header>

      {/* SUB-HEADER STATE INFO AT A GLANCE */}
      <section className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap justify-between items-center text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-500 font-mono text-[10px] uppercase">Selected Dossier:</span>
          <span className="font-bold text-slate-800 bg-[#003366]/5 px-2 py-0.5 rounded text-xs select-none">
            {selectedCase ? `${selectedCase.formType} - ${selectedCase.title}` : "No Application Selected"}
          </span>
        </div>
        <div className="flex gap-4 text-[10px] font-semibold text-slate-400 font-mono uppercase">
          <span>Total Dossiers: {casesCount}</span>
          <span className="text-slate-300">|</span>
          <span>Security Status: DHS HTTPS-SSL Certified</span>
        </div>
      </section>

      {/* CORE WORKSPACE CONTENT */}
      <main className="flex-1 p-6 md:p-8 max-w-7xl w-full mx-auto">
        <AnimatePresence mode="wait">
          
          {/* VIEW 1: APPLICATIONS DASHBOARD & CASE VISUALS */}
          {activeTab === "dashboard" && (
            <div key="dashboard-tab">
              <Dashboard 
                onSelectCase={setSelectedCase} 
                selectedCase={selectedCase}
                onChecklistRequest={handleChecklistRequest}
                onLetterRequest={handleLetterRequest}
              />
            </div>
          )}

          {/* VIEW 2: DYNAMIC DOCUMENT CHECKLIST ENGINE */}
          {activeTab === "checklist" && (
            <div key="checklist-tab" className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Form Picker panel */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                  <h3 className="text-sm font-bold text-slate-800 font-display mb-3 uppercase tracking-wide">Select USCIS form checklist</h3>
                  <p className="text-xs text-slate-500 leading-relaxed mb-4">
                    Choose an official petition format to generate an evidence checklists mandated by current USCIS adjudicator handbook directions.
                  </p>
                  
                  <div className="space-y-2">
                    {["I-485", "I-140", "I-130", "I-765", "I-131"].map((f) => (
                      <button
                        key={f}
                        id={`checklist-select-${f}`}
                        onClick={() => {
                          setChecklistForm(f);
                          fetchChecklist(f);
                        }}
                        className={`w-full text-left text-xs px-4 py-3 rounded-lg border flex justify-between items-center transition cursor-pointer font-semibold ${
                          checklistForm === f 
                            ? "bg-[#003366] text-white border-[#003366]" 
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        <span>Form {f} Evidence list</span>
                        {checklistForm === f ? (
                          <CheckSquare className="w-4 h-4 text-white" />
                        ) : (
                          <FileText className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100">
                    <div className="bg-slate-50 rounded-lg p-3 text-[11px] text-slate-500 leading-relaxed">
                      <strong>Important Notice:</strong> Supporting records must match certified translations. Bring originals to any interview block.
                    </div>
                  </div>
                </div>

                {/* Helpful resources */}
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Processing Aids</h4>
                  <div className="space-y-2.5 text-xs text-slate-600 leading-relaxed">
                    <div className="p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition flex items-center justify-between cursor-pointer">
                      <span>USCIS Photo Spec Guide</span>
                      <span className="text-[#003366]">→</span>
                    </div>
                    <div className="p-3 border border-slate-100 rounded-lg hover:bg-slate-50 transition flex items-center justify-between cursor-pointer">
                      <span>Filing Fees Calculator</span>
                      <span className="text-[#003366]">→</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Checklist details Panel */}
              <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm space-y-6">
                {isLoadingChecklist ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-10 h-10 text-brand-600 animate-spin mb-3" />
                    <div className="text-sm font-semibold text-slate-700">Assembling Form {checklistForm} Filing Checklist...</div>
                    <p className="text-xs text-slate-400 mt-1">Cross referencing mandatory code parameters</p>
                  </div>
                ) : checklistData ? (
                  <div className="space-y-6">
                    <div>
                      <span className="bg-brand-50 text-brand-700 font-mono text-[10px] font-bold px-2 py-1 rounded">
                        {checklistData.category}
                      </span>
                      <h2 className="text-xl font-bold tracking-tight text-slate-900 font-display mt-2">
                        {checklistData.form}: {checklistData.title}
                      </h2>
                      <p className="text-xs text-slate-500 mt-1">
                        Review supporting documents required prior to mailing or online document submission. Mark them completed once gathered.
                      </p>
                    </div>

                    {/* Completion stats widget */}
                    <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex justify-between items-center text-xs text-emerald-950 font-semibold">
                      <div className="flex items-center gap-2">
                        <Award className="w-5 h-5 text-emerald-600 shrink-0" />
                        <div>
                          <span>Ready to File Metrics</span>
                          <p className="text-[10px] text-emerald-700 font-normal">Check components systematically as you prepare packets.</p>
                        </div>
                      </div>
                      <span className="text-sm font-bold bg-[#fff] px-2.5 py-1 rounded text-emerald-900 border border-emerald-200 shadow-sm font-mono">
                        {Object.values(checklistCompletions).filter(Boolean).length} Verified Ready
                      </span>
                    </div>

                    {/* Dynamic Sections iterator */}
                    <div className="space-y-6">
                      {checklistData.sections?.map((section, sIdx) => (
                        <div key={sIdx} className="space-y-3">
                          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-100 pb-1.5">
                            {section.sectionTitle}
                          </h3>
                          
                          <div className="space-y-2.5">
                            {section.items?.map((item, iIdx) => {
                              const itemKey = `${checklistForm}-${sIdx}-${iIdx}`;
                              const isChecked = !!checklistCompletions[itemKey];
                              return (
                                <div 
                                  key={iIdx}
                                  onClick={() => toggleChecklistItem(itemKey)}
                                  className={`p-4 rounded-xl border transition-all duration-200 cursor-pointer flex items-start gap-4 ${
                                    isChecked 
                                      ? "bg-slate-50 border-slate-200 opacity-80" 
                                      : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"
                                  }`}
                                >
                                  <div className="mt-0.5">
                                    <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                                      isChecked 
                                        ? "bg-brand-600 border-brand-600 text-white" 
                                        : "border-slate-300 hover:border-slate-400 bg-white"
                                    }`}>
                                      {isChecked && <Check className="w-3.5 h-3.5" />}
                                    </div>
                                  </div>

                                  <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                      <span className={`text-xs font-bold ${isChecked ? "line-through text-slate-500" : "text-slate-800"}`}>
                                        {item.name}
                                      </span>
                                      {item.required ? (
                                        <span className="text-[9px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded-full font-bold uppercase shrink-0">Mandatory</span>
                                      ) : (
                                        <span className="text-[9px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full font-semibold uppercase shrink-0">Recommended</span>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                      {item.description}
                                    </p>
                                    {item.tips && (
                                      <div className="text-[10px] text-brand-600 font-semibold font-mono mt-1 leading-normal">
                                        💡 Tips: {item.tips}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>

                  </div>
                ) : (
                  <div className="text-center py-20 text-slate-400 text-xs">
                    Please select or load form checklists.
                  </div>
                )}
              </div>

            </div>
          )}

          {/* VIEW 3: AI COVER LETTER & EXPEDITE REQUEST WRITER */}
          {activeTab === "letters" && (
            <div key="letters-tab" className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Column Controls */}
              <div className="lg:col-span-4 space-y-6">
                <form onSubmit={handleGenerateLetter} className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 font-display uppercase tracking-wide">USCIS Cover Letter Drafter</h3>
                    <p className="text-xs text-slate-500 leading-relaxed mt-1">
                      Draft legal-standard cover letters accompanying application packets, service inquiries, or humanitarian expediting requests.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 font-medium mb-1">Target Form Type</label>
                    <select
                      value={letterFormType}
                      onChange={(e) => setLetterFormType(e.target.value)}
                      className="w-full text-xs px-2.5 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 bg-white"
                    >
                      {["I-485", "I-140", "I-130", "I-765", "I-131", "I-539", "N-400"].map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 font-medium mb-1">Document Profile Type</label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {[
                        { code: "cover", label: "Initial Submission Cover Letter", desc: "For new filing forms package list" },
                        { code: "expedite", label: "USCIS Expedite Request", desc: "For financial, medical or humanitarian urgency" },
                        { code: "inquiry", label: "Outside Normal processing inquiry", desc: "For cases running long over estimates" }
                      ].map((type) => (
                        <div 
                          key={type.code}
                          onClick={() => setLetterType(type.code)}
                          className={`p-2.5 rounded-lg border text-left cursor-pointer transition flex items-start gap-2 ${
                            letterType === type.code 
                              ? "bg-[#003366]/5 border-[#003366] text-[#003366]" 
                              : "bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-600"
                          }`}
                        >
                          <div className={`w-3.5 h-3.5 rounded-full border shrink-0 mt-0.5 flex items-center justify-center ${
                            letterType === type.code ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300"
                          }`}>
                            {letterType === type.code && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                          </div>
                          <div>
                            <span className="text-[11px] font-bold block">{type.label}</span>
                            <span className="text-[10px] text-slate-400 font-medium leading-none block mt-0.5">{type.desc}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {letterType === "expedite" && (
                    <div>
                      <label className="block text-xs text-slate-500 font-medium mb-1">Specific Expediting Reason</label>
                      <textarea
                        value={expeditingReasons}
                        onChange={(e) => setExpeditingReasons(e.target.value)}
                        placeholder="e.g. Healthcare facility staffing shortages, extreme commercial losses, or critical medical procedure schedules..."
                        rows={3}
                        className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 text-slate-600"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs text-slate-500 font-medium mb-1">Applicant Contact details</label>
                    <textarea
                      value={applicantDetails}
                      onChange={(e) => setApplicantDetails(e.target.value)}
                      placeholder="Applicant Name & Current US Address"
                      rows={3}
                      className="w-full text-xs p-2.5 border border-slate-200 rounded-lg focus:outline-none focus:border-brand-500 text-slate-600"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isLoadingLetter}
                    className="w-full bg-[#003366] hover:bg-[#002244] text-white text-xs font-bold py-3 rounded-lg transition-colors cursor-pointer flex justify-center items-center gap-1.5 shadow-sm"
                  >
                    {isLoadingLetter ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Drafting official documentation...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 text-brand-300" />
                        <span>Build Document Template</span>
                      </>
                    )}
                  </button>
                </form>
              </div>

              {/* Right Column Markdown Display rendering screen */}
              <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-sm flex flex-col min-h-[500px]">
                {isLoadingLetter ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-20 text-center animate-pulse">
                    <Sparkles className="w-12 h-12 text-[#003366] mb-3" />
                    <div className="text-sm font-semibold text-slate-800">Drafting USCIS Official Correspondence...</div>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm">
                      Our Gemini AI model is currently optimizing paragraphs, document indices, and legal disclaimer blocks.
                    </p>
                  </div>
                ) : draftedLetter ? (
                  <div className="flex-1 flex flex-col justify-between">
                    
                    {/* Actions tools bar */}
                    <div className="flex justify-between items-center bg-slate-50 rounded-lg p-3 border border-slate-100 mb-6 shrink-0">
                      <span className="text-xs text-slate-500 font-medium">Form type formatted preview</span>
                      <div className="flex gap-2">
                        <button
                          onClick={handleCopyLetter}
                          className="flex items-center gap-1 bg-white hover:bg-slate-100 text-slate-700 text-xs px-3 py-1.5 rounded-md border border-slate-200 font-medium cursor-pointer transition-[background-color]"
                        >
                          {copiedLetter ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                              <span className="text-emerald-600 font-bold">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" />
                              <span>Copy Draft</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={handleDownloadLetter}
                          className="flex items-center gap-1 bg-brand-600 hover:bg-brand-700 text-white text-xs px-3 py-1.5 rounded-md font-bold cursor-pointer transition-[background-color]"
                        >
                          <ArrowDownToLine className="w-3.5 h-3.5 text-blue-200" />
                          <span>Download MD</span>
                        </button>
                      </div>
                    </div>

                    {/* Document display area simulating official letter head */}
                    <div className="bg-white border-2 border-slate-100 rounded-lg p-6 md:p-8 flex-1 overflow-auto max-h-[600px] shadow-sm font-sans">
                      <div className="border-b-2 border-[#003366] pb-4 mb-6 text-center select-none">
                        <h1 className="font-display font-black text-xs uppercase tracking-widest text-[#003366] leading-none mb-1">Immigration Support Document Services</h1>
                        <p className="text-[9px] text-slate-400 font-mono">CONFIDENTIAL FOR FILING PURPOSES ONLY</p>
                      </div>

                      <div className="prose max-w-none text-xs selection:bg-brand-100">
                        {renderMarkdown(draftedLetter)}
                      </div>
                    </div>

                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#f8fafc] border border-dashed border-slate-200 rounded-xl py-24">
                    <FileText className="w-12 h-12 text-slate-300 mb-2" />
                    <div className="text-sm font-bold text-slate-700">No Document Drafted Yet</div>
                    <p className="text-xs text-slate-400 max-w-sm mt-1">
                      Configure your applicant specifics and hit the "Build Document Template" button to construct an USCIS correspondence using Gemini.
                    </p>
                  </div>
                )}
              </div>

            </div>
          )}

          {/* VIEW 4: INTELLIGENT USCIS PARLIAMENTARY CHAT ASSISTANT */}
          {activeTab === "chat" && (
            <div key="chat-tab" className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Profile / Context information details */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-bold text-slate-800 font-display uppercase tracking-wide">USCIS Assistant</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Ask questions on priority dates, premium processing eligibility, RFEs, biometrics, or passport renewals to get instant answers.
                  </p>
                  
                  {/* Sample prompt quick helpers */}
                  <div className="pt-3 border-t border-slate-100">
                    <span className="text-[10px] text-slate-400 font-mono font-bold block mb-2">SAMPLE Q'S TO CLINCH INFO:</span>
                    <div className="space-y-1.5 font-sans">
                      {[
                        "How to handle a USCIS Request for Evidence (RFE)?",
                        "What documents are needed for my Biometrics appointment?",
                        "Explain Visa Bulletin Priorities & final action date tables",
                        "Form I-140 Premium Processing timescales and costs"
                      ].map((promptText, idx) => (
                        <button
                          key={idx}
                          id={`quick-prompt-${idx}`}
                          onClick={() => {
                            setChatMessage(promptText);
                            handleSendChatMessage(undefined, promptText);
                          }}
                          className="w-full text-left text-[11px] p-2.5 rounded-lg border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition text-slate-700 font-semibold cursor-pointer block leading-snug"
                        >
                          {promptText}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3 text-xs text-orange-950">
                  <ShieldAlert className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Legal Advisory Notice:</strong>
                    <p className="text-[10px] text-orange-850 opacity-90 mt-1 leading-relaxed">
                      AI Advisory Companion outputs baseline tracking answers derived from USCIS public source manuals. This does not constitute credentialed legal counsel. Review instructions extensively!
                    </p>
                  </div>
                </div>
              </div>

              {/* Real Chat panel */}
              <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-[580px] overflow-hidden">
                
                {/* Chat header banner */}
                <div className="bg-slate-50 border-b border-slate-200 px-5 py-3.5 flex justify-between items-center shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-xs font-bold text-slate-700 font-display">Advisory AI Live Session</span>
                  </div>
                  <button
                    onClick={() => setChatHistory([
                      { role: "bot", content: "### USCIS Advisory Companion\n\nReset complete! How can I assist you with your USCIS timeline, documents, or regulations today?" }
                    ])}
                    title="Clear Conversation History"
                    className="p-1 px-2.5 rounded border border-slate-200 bg-white hover:bg-slate-50 text-[10px] font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer flex items-center gap-1 uppercase font-mono"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                </div>

                {/* Messages scrollarea */}
                <div className="flex-1 overflow-auto p-5 space-y-4">
                  {chatHistory.map((m, mIdx) => {
                    const isUser = m.role === "user";
                    return (
                      <div key={mIdx} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-xs ${
                          isUser 
                            ? "bg-[#003366] text-white border-2 border-[#002244]" 
                            : "bg-slate-50 text-slate-800 border-2 border-slate-100"
                        }`}>
                          <div className={`text-[9px] font-mono opacity-65 mb-1 ${isUser ? "text-right" : "text-left"}`}>
                            {isUser ? "YOU" : "USCIS COUNSEL ADVISOR"}
                          </div>
                          
                          {isUser ? (
                            <p className="leading-relaxed">{m.content}</p>
                          ) : (
                            <div className="prose max-w-none">
                              {renderMarkdown(m.content)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {isLoadingChat && (
                    <div className="flex justify-start">
                      <div className="bg-slate-50 text-slate-500 border-2 border-slate-100 rounded-xl px-4 py-3 text-xs flex items-center gap-2 font-semibold">
                        <Loader2 className="w-4 h-4 text-[#003366] animate-spin" />
                        <span>Consulting federal regulation manuals...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Input submission layout form */}
                <form 
                  onSubmit={handleSendChatMessage}
                  className="bg-slate-50 border-t border-slate-200 p-4 shrink-0 flex gap-2.5"
                >
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder="Type in a visa, USCIS code, or filing query... (e.g. How and when is Form I-693 filed?)"
                    className="flex-1 text-xs px-3.5 py-2.5 border border-slate-200 bg-white rounded-xl focus:outline-none focus:border-brand-500 leading-normal"
                  />
                  <button
                    type="submit"
                    disabled={isLoadingChat}
                    className="bg-[#003366] hover:bg-[#002244] text-white p-3 rounded-xl transition cursor-pointer flex justify-center items-center shrink-0 border border-[#001122]"
                  >
                    <Send className="w-4 h-4 text-blue-100" />
                  </button>
                </form>

              </div>

            </div>
          )}

        </AnimatePresence>
      </main>

      {/* PROFESSIONAL POLISH USCIS OFFICAL DESIGN FOOTER */}
      <footer className="bg-slate-100 border-t border-slate-200 py-6 px-8 flex flex-col md:flex-row justify-between items-center gap-4 text-[10px] text-slate-500 font-semibold uppercase tracking-tight tracking-wider shrink-0">
        <div>&copy; {new Date().getFullYear()} U.S. DEPARTMENT OF HOMELAND SECURITY. ALL RIGHTS RESERVED.</div>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <a href="#" className="hover:text-[#003366] transition">Privacy Policies</a>
          <span>•</span>
          <a href="#" className="hover:text-[#003366] transition">Terms of Service</a>
          <span>•</span>
          <a href="#" className="hover:text-[#003366] transition">Section 508 Accessibility</a>
          <span>•</span>
          <span className="text-slate-400 font-mono text-[9px]">Server Version: 4.1-Prod</span>
        </div>
      </footer>

    </div>
  );
}
