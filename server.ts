import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialize Gemini Client helper
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("WARNING: GEMINI_API_KEY is not set in environment.");
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || "MOCK_KEY_FOR_DEV",
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// 1. Analyze case details via Gemini
app.post("/api/uscis/analyze", async (req, res) => {
  try {
    const { receiptNumber, formType, filedDate, center, country } = req.body;

    if (!formType || !filedDate) {
      res.status(400).json({ error: "Form type and filed date are required." });
      return;
    }

    const ai = getGeminiClient();
    
    // Check if the API key exists. If not, fallback to a smart programmatic response to ensure the app functions offline or before API key setup.
    if (!process.env.GEMINI_API_KEY) {
      // Return a structured fallback response
      res.json(getOfflineFallbackAnalysis(receiptNumber, formType, filedDate, center, country));
      return;
    }

    const prompt = `
You are an expert immigration consultant tracking USCIS visa application cases.
The user has provided the following details:
- Receipt Number: ${receiptNumber || "N/A"}
- USCIS Form: ${formType} (e.g., G-28, I-129, I-140, I-485, I-765, I-131, I-130, I-539, N-400)
- Date Filed: ${filedDate}
- USCIS Processing Service Center: ${center || "Auto-detect"}
- Country of Chargeability / Birth: ${country || "Not Specified"}

Please analyze this case and provide a structured JSON response with the following format. Ensure your response is strictly in valid JSON format matching this schema:
{
  "receiptValidation": {
    "isValidFormat": boolean,
    "prefixCode": "string (e.g. LIN, MSC, etc. what it means)",
    "prefixOfficeDetails": "string explanation of the office name/region code"
  },
  "currentEstimatedStatus": "string (e.g. Received / Biometrics Scheduled / Fingerprints Applied / Pending / Decision etc.)",
  "processingCenter": "string (name of the actual service center)",
  "estimatedOverallTimeMonths": number (average processing time in months for this form/center),
  "progressPercentage": number (0-100 indicating relative progress based on the wait times from filing date),
  "daysFiledToNow": number,
  "estimatedDecisionDate": "YYYY-MM-DD or Month YYYY",
  "historicalMilestones": [
    {
      "step": "string (e.g. 1. Case Received)",
      "status": "completed | active | upcoming",
      "date": "string (actual or expected date like 'Month YYYY' or 'May 2026')",
      "description": "string (explanation of this stage)"
    }
  ],
  "customInsights": [
    "string (insight 1, e.g. Visa Bulletin priority date notes if I-485)",
    "string (insight 2, e.g. Expedite options, premium processing eligibility)",
    "string (insight 3, e.g. Expected next actions)"
  ],
  "actionsToTake": [
    {
      "title": "string (e.g. Check Priority Date / Submit Inquiry)",
      "description": "string (guidance)"
    }
  ]
}

Use realistic USCIS patterns. For example, IOE, LIN (Nebraska), SRC (Texas), EAC (Vermont), WAC (California), MSC (National Benefit Center).
Evaluate if premium processing is an option for this form type (e.g. standard I-129, I-140 have premium processing, I-485 and I-130 do not). If I-485 and Chargeability is provided, factor in visa bulletin backlogs if appropriate!
Return ONLY the raw JSON block without formatting wrappers (like \`\`\`json).
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const text = response.text || "";
    try {
      const parsed = JSON.parse(text.trim());
      res.json(parsed);
    } catch (parseErr) {
      console.error("JSON parsing error from Gemini raw response:", text);
      res.status(500).json({ error: "Failed to parse API response. Please retry.", raw: text });
    }
  } catch (error: any) {
    console.error("USCIS Analyze Endpoint error:", error);
    res.status(500).json({ error: error.message || "An error occurred during case analysis." });
  }
});

// 2. Draft Cover Letter / Inquiry / Expedite request via Gemini
app.post("/api/uscis/draft-letter", async (req, res) => {
  try {
    const { receiptNumber, formType, filedDate, center, letterType, expeditingReasons, personalDetails } = req.body;

    if (!formType || !letterType) {
      res.status(400).json({ error: "Form type and letter type are required." });
      return;
    }

    const ai = getGeminiClient();

    if (!process.env.GEMINI_API_KEY) {
      res.json({
        letter: getOfflineFallbackLetter(receiptNumber, formType, filedDate, center, letterType, expeditingReasons, personalDetails),
      });
      return;
    }

    const prompt = `
You are a highly capable immigration lawyer drafting a professional USCIS communication letter.
Draft a ${letterType === "expedite" ? "USCIS Expedite Request Letter" : letterType === "inquiry" ? "USCIS Case Status Inquiry Support Letter" : "USCIS Cover Letter for Initial Submission"}.

Input details:
- Form Type: ${formType}
- Receipt Number: ${receiptNumber || "PENDING / INITIAL SUBMISSION"}
- Date Filed/Applying: ${filedDate || "To be filed"}
- Service Center: ${center || "USCIS Office"}
- Additional Details / Special Expedite Reasons: ${expeditingReasons || "Extreme financial hardship, healthcare worker or humanitarian reasons."}
- Applicant Information: ${personalDetails || "Applicant name and address placeholders"}

Instructions:
1. Write a formal, high-quality letter addressing USCIS Officers.
2. Ensure proper letter structure: date and place, recipient details, subject line, professional opening, clear body explaining the request or initial submission layout, list of enclosed documents/checklists, clear contact details, and a legal professional signature block.
3. Be persuasive, objective, and deeply professional.
4. Output the letter in structured Markdown. Include visual sections and details. No preambles, just output the markdown.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    res.json({ letter: response.text });
  } catch (error: any) {
    console.error("USCIS Letter Draft error:", error);
    res.status(500).json({ error: error.message || "An error occurred during letter generation." });
  }
});

// 3. Document checklist generator
app.post("/api/uscis/checklist", async (req, res) => {
  try {
    const { formType } = req.body;

    if (!formType) {
      res.status(400).json({ error: "Form type is required." });
      return;
    }

    const ai = getGeminiClient();

    if (!process.env.GEMINI_API_KEY) {
      res.json(getOfflineFallbackChecklist(formType));
      return;
    }

    const prompt = `
Provide a structured document checklist of mandatory and highly recommended supporting evidence for filing USCIS Form ${formType}.
Response must be strictly JSON in this schema:
{
  "form": "string (e.g. Form I-485)",
  "title": "string (full form title)",
  "category": "string (e.g. Employment-Based / Family-Based / Citizenship)",
  "sections": [
    {
      "sectionTitle": "string (e.g., Mandatory Identity Documents)",
      "items": [
        {
          "name": "string (e.g., Birth Certificate)",
          "required": boolean,
          "description": "string (e.g., Certified translation required if not in English)",
          "tips": "string (practical advice for submission)"
        }
      ]
    }
  ]
}
Ensure it is strictly valid JSON without \`\`\`json enclosing blocks. Only output the raw JSON.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
      },
    });

    const parsed = JSON.parse(response.text?.trim() || "{}");
    res.json(parsed);
  } catch (error: any) {
    console.error("USCIS Checklist error:", error);
    res.status(500).json({ error: error.message || "An error occurred during checklist generation." });
  }
});

// 4. USCIS Immigration Q&A Chat Assistant
app.post("/api/uscis/chat", async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      res.status(400).json({ error: "Message is required." });
      return;
    }

    const ai = getGeminiClient();

    if (!process.env.GEMINI_API_KEY) {
      res.json({
        reply: getOfflineFallbackChatReply(message),
      });
      return;
    }

    // Prepare message contents with history context
    const formattedHistory = (history || []).map((h: any) => ({
      role: h.role === "user" ? "user" : "model",
      parts: [{ text: h.content }]
    }));

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        ...formattedHistory,
        { role: "user", parts: [{ text: message }] }
      ],
      config: {
        systemInstruction: `You are an expert, empathetic US Immigration Consultant and Advisor.
Your job is to help users understand complex USCIS rules, visa types (H-1B, Green Card adjustments, family sponsorship, naturalization), document checklists, priority dates, RFEs, and biometrics.
Explain things clearly using simple human terms. Avoid clinical lawyer jargon where possible.
Always include a clear disclaimer that your response is for informational and educational purposes only and is not official legal advice.
Format your response in sleek, clean Markdown with bullet points or numbered layouts where details are heavy.`,
      }
    });

    res.json({ reply: response.text });
  } catch (error: any) {
    console.error("USCIS Chat error:", error);
    res.status(500).json({ error: error.message || "An error occurred during chat conversation." });
  }
});

// Offline Falback Helpers
function getOfflineFallbackChatReply(msg: string): string {
  const query = msg.toLowerCase();
  
  let disclaimer = "\n\n---\n*Disclaimer: I am your offline AI assistant. This response is compiled from baseline USCIS patterns and is for educational references only, not legal counsel.*";
  
  if (query.includes("rfe") || query.includes("evidence")) {
    return `### Response: Handling a USCIS Request for Evidence (RFE)

An RFE is extremely common and does **NOT** mean your case is going to be denied. It simply means the reviewing officer needs additional proof to verify your eligibility.

**Key Best Practices:**
1. **Never send partial responses:** You must submit everything requested in a single response bundle. USCIS only reviews the first packet you send in reply to that specific RFE.
2. **Observe the Deadline Strictly:** Missing the response date (typically 30 to 87 days) triggers a denial based on abandonment, which is very difficult to restore.
3. **Draft a Clear Cover sheet:** Organize your response exhibits in the exact numbered index that corresponds to the questions asked on the RFE letter.
4. **Acquire certified translations:** Any non-English papers must be accompanied by a certified translator certificate.

Would you like me to draft an initial response or coordinate checklists for your RFE?${disclaimer}`;
  }

  if (query.includes("biometrics") || query.includes("fingerprint")) {
    return `### Response: USCIS Biometrics Guidelines

USCIS schedules a brief biometrics appointment (Form I-797C) typically 3 to 6 weeks after you file your application.

**Important details:**
1. **What happens:** They capture your fingerprints, signature, and take a photo. This is sent to the FBI for criminal background and safety checks, verifying your identity.
2. **What to bring:** Bring your official appointment notice (I-797C) and a valid government photo identity (e.g. Passport, driver's license).
3. **Rescheduling:** If you miss it, you should reschedule immediately. However, try to avoid rescheduling if possible as it can delay case processing times by weeks or months.

Let me know if you would like me to draft an expedite or cover documents template.${disclaimer}`;
  }

  if (query.includes("premium") || query.includes("expedite")) {
    return `### Response: Fast-Tracking USCIS Cases (Premium Processing vs. Expediting)

There are two primary pathways to speed up decisions:

1. **Premium Processing (Form I-907):**
   * **Cost:** Paid fee (ranges from $1,680 to $2,805 depending in category).
   * **Timeline:** Guarantees action in 15 or 45 calendar days.
   * **Availability:** Eligible for most employment-based applications (Form I-129 and Form I-140) and some I-765 OPT filings. It is **NOT** available for Green Card Adjustment (I-485) or standard relative files (I-130).

2. **Expedite Requests (Free option):**
   * **Criteria:** Based on extreme financial loss to USA entities or applicant, humanitarian emergencies, essential government interests, or clear USCIS administrative error.
   * **Approval level:** Discretionary and strictly scrutinized. Strong documentation is required.

Let me know if you'd like me to draft an **Expedite Request Cover Letter** using our letters tab!${disclaimer}`;
  }

  if (query.includes("priority date") || query.includes("bulletin")) {
    return `### Response: Understanding the Visa Bulletin & Priority Dates

Your **Priority Date** is your place in the immigration line. It is established on the day USCIS receives your petition (e.g., I-130 relative filing, or labor certification date for EB categories).

* **Final Action Dates:** Tells you if a visa is currently available for allocation. If your priority date is before the date shown in this column for your country, you are eligible for visa scheduling/approval.
* **Dates for Filing:** Tells you when you can submit your supporting documentation (I-485 or DS-260) to the NVC or USCIS, even if your visa is not yet ready for final approval.
* **Chargeability:** Based on your country of birth, not citizenship. Countries with high backlogs (India, China, Mexico, Philippines) face longer wait lists.

Tell me your specific visa category (e.g. EB-2, F-2A) and priority date, and I can explain your path!${disclaimer}`;
  }

  return `### USCIS Advisor Assistant

Welcome! I am your interactive USCIS Advice Companion. You can ask me any questions regarding:
1. **Visa processing steps** (Form I-485, I-140, I-130, I-765, N-400 etc.)
2. **Filing fee standards**
3. **Expediting and requests for evidence (RFE)**
4. **Biometric fingerprinting guides**
5. **Timeline expectations and bulletin priority dates**

*How can I assist your immigration journey today?*${disclaimer}`;
}

function getOfflineFallbackAnalysis(receiptNumber: string, formType: string, filedDate: string, center: string, country: string) {
  const filed = new Date(filedDate);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - filed.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  // Basic validation rules
  const cleanReceipt = receiptNumber ? receiptNumber.trim().toUpperCase() : "";
  const isValidFormat = /^[A-Z]{3}\d{10}$/.test(cleanReceipt);
  const prefix = isValidFormat ? cleanReceipt.substring(0, 3) : "N/A";
  
  const prefixMap: Record<string, string> = {
    IOE: "ELIS (Electronic Immigration System / Digitized Records)",
    MSC: "National Benefit Center (NBC), Missouri",
    LIN: "Nebraska Service Center, Lincoln",
    SRC: "Texas Service Center, Dallas/Mesquite",
    EAC: "Vermont Service Center, St. Albans",
    WAC: "California Service Center, Laguna Niguel",
    YSC: "Potomac Service Center, Arlington",
  };

  const detectedCenter = center || (prefixMap[prefix] ? prefixMap[prefix].split(",")[0] : "National Benefit Center (NBC)");

  // Estimated times based on popular USCIS historical forms
  let estMonths = 8;
  if (formType === "I-485") estMonths = 12;
  else if (formType === "I-140") estMonths = 6;
  else if (formType === "I-130") estMonths = 14;
  else if (formType === "I-765") estMonths = 4;
  else if (formType === "I-131") estMonths = 7;
  else if (formType === "I-539") estMonths = 5;
  else if (formType === "N-400") estMonths = 9;

  const progressPercentage = Math.min(Math.round((diffDays / (estMonths * 30)) * 100), 100);

  const decDate = new Date();
  decDate.setTime(filed.getTime() + (estMonths * 30 * 24 * 60 * 60 * 1000));
  const decDateStr = decDate.toISOString().split("T")[0];

  const milestones = [
    {
      step: "Case Received & Receipt Notice Sent",
      status: "completed",
      date: filed.toISOString().split("T")[0],
      description: "USCIS received your case, created the receipt block, and mailed you Form I-797C."
    },
    {
      step: "Biometrics Appointment (Fingerprints)",
      status: diffDays > 30 ? "completed" : "active",
      date: new Date(filed.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      description: "Most tracking records show biometrics scheduled within 3 to 6 weeks from filing."
    },
    {
      step: "Case Under Active Review",
      status: progressPercentage > 40 ? "completed" : (progressPercentage > 20 ? "active" : "upcoming"),
      date: new Date(filed.getTime() + 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      description: "USCIS officers verify biometric match and perform background checks on safety portals."
    },
    {
      step: "Request for Evidence (RFE) Window (If applicable)",
      status: progressPercentage > 75 ? "completed" : "upcoming",
      date: new Date(filed.getTime() + (estMonths * 0.7 * 30) * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      description: "Officer may send Form I-797 query if additional documents are needed. Keep alerts enabled!"
    },
    {
      step: "Final Decision Rendered",
      status: progressPercentage >= 100 ? "completed" : "upcoming",
      date: decDateStr,
      description: "Final approval or scheduling of interview (for forms requiring personal interview like I-485/N-400)."
    }
  ];

  return {
    receiptValidation: {
      isValidFormat,
      prefixCode: prefix,
      prefixOfficeDetails: prefixMap[prefix] || "Unknown or Virtual USCIS Office"
    },
    currentEstimatedStatus: progressPercentage >= 100 ? "Decision Expected" : (progressPercentage > 50 ? "Under Active Review" : "In Initial Processing"),
    processingCenter: detectedCenter,
    estimatedOverallTimeMonths: estMonths,
    progressPercentage,
    daysFiledToNow: diffDays,
    estimatedDecisionDate: decDateStr,
    historicalMilestones: milestones,
    customInsights: [
      `Your case has been pending for ${diffDays} days at ${detectedCenter}.`,
      formType === "I-140" || formType === "I-129" 
        ? "This form category is eligible for premium processing upgrading to expedite decisions within 15 calendar days." 
        : "Standard processing is in effect. Premium processing is unfortunately not available for adjustment cases or family base petitions in this category.",
      country 
        ? `Given country eligibility for ${country}, ensure you monitor the Department of State Visa Bulletin priority date tables regularly.` 
        : "No specific bulletin backlog factors applied. Case progresses strictly under center timelines."
    ],
    actionsToTake: [
      {
        title: "Download Case Cover Letters",
        description: "Generate professionally formatted Cover templates with specific form indices."
      },
      {
        title: "Verify Supporting Documents",
        description: "Check our dynamic document checklist tab to ensure you have correct translations ready for potential RFEs."
      }
    ]
  };
}

function getOfflineFallbackLetter(receiptNumber: string, formType: string, filedDate: string, center: string, letterType: string, reasons: string, details: string) {
  const applicantLabel = details || "[YOUR FULL NAME]\n[Applicant Address Placeholders]\nEmail: contact@example.com";
  const rcpt = receiptNumber || "PENDING INITIAL FILING";
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  
  if (letterType === "expedite") {
    return `# USCIS EXPEDITE REQUEST COVER LETTER
  
**Date:** ${dateStr}
**VIA:** Support Upload Portal / Service Center Expedite Line
  
**TO:**
U.S. Citizenship and Immigration Services (USCIS)
Attn: Officer of Expedite Request Evaluations
**Processing Center:** ${center || "USCIS Field Office"}
  
---
  
### SUBJECT: URGENT EXPEDITE REQUEST FOR FORM ${formType}
**Receipt Number:** ${rcpt}
**Date of Filing:** ${filedDate || "Initial filing accompanying this packet"}
**Applicant:** ${applicantLabel.split("\n")[0]}
  
Dear immigration Officer,
  
I am writing to respectfully request the expedited processing of my pending **Form ${formType}** application pursuant to the published USCIS Expedite Criteria. I am experiencing circumstances that fit directly under the agency's criteria supporting accelerated evaluation.
  
#### SECTION 1: GROUNDS FOR EXPEDITIOUS REVIEW
We request urgent attention as detailed under the following core parameters:
${reasons || "* Extreme financial distress to the citizen, resident, or employer organizations.\n* Severe humanitarian concern needing rapid authorization.\n* Essential US Government or national interest reasons."}
  
Our primary hardship centers on immediate impact variables that would result in irreversible damage if normal processing schedules apply. Delays severely bottleneck state-licensed functions and trigger critical financial shortfalls.
  
#### SECTION 2: ENCLOSED SUPPORTING EXHIBITS FOR PROOF
Please find the following records enclosed to sustain this petition:
1. Copy of the initial receipt notice (Form I-797C) showing date ${filedDate || "To be confirmed"}.
2. Employer affidavits establishing specific job requirements, specialized knowledge, or urgent needs.
3. Financial ledger worksheets, bank reports, and bills proving critical timelines.
4. Expert recommendation letters or certified state/federal health credentials showing public benefit.
  
Thank you for your noble service, time, and prompt action on this urgent matter.
  
Sincerely,
  
  
**${applicantLabel.split("\n")[0]}**
*Applicant Petitioner*
  
---
*Disclaimer: Generated via local AI assistant templates. Please modify bracketed fields to match personal circumstances before submission.*`;
  } else if (letterType === "inquiry") {
    return `# USCIS OFFICIAL SERVICE INQUIRY LETTER (OUTSIDE NORMAL PROCESSING TIME)
  
**Date:** ${dateStr}
  
**TO:**
U.S. Citizenship and Immigration Services (USCIS)
**Service Center:** ${center || "USCIS Processing Center"}
  
---
  
### SUBJECT: STATUS INQUIRY FOR Form ${formType}
**Receipt Number:** ${rcpt}
**Date of Original Receipt:** ${filedDate || "Not Specified"}
  
Dear Immigration Officer,
  
I am writing to formally request a code-level case update for my pending **Form ${formType}** application, which was initially received by USCIS on **${filedDate || "[Date of Filing]"}**.
  
As of today, my application has been officially pending for many months. According to the current USCIS Official Processing Time thresholds for Form ${formType} at the **${center || "processed center"}**, my case is currently **outside of normal processing times**. 
  
I have checked the status online and it has shown no major processing activities beyond standard receipt warnings. No requests for evidence (RFE) are pending, and biometrics have been completed.
  
Please review my case file. If there are outstanding requirements or forms that must be completed, please alert my attention immediately so I may supply the files without delays.
  
Thank you for your assistance.
  
Sincerely,
  
  
**${applicantLabel.split("\n")[0]}**
*Applicant/Petitioner*`;
  } else {
    return `# USCIS FORMAL SUBMISSION COVER LETTER FOR FORM ${formType}
  
**Date:** ${dateStr}
  
**TO:**
Department of Homeland Security
U.S. Citizenship and Immigration Services (USCIS)
Attn: Form Receipt Intake
  
---
  
### SUBJECT: Form ${formType} Filing Submission Packet
**Applicant:** ${applicantLabel.split("\n")[0]}
**Filing Type:** Original Visa Petition & Accompanying Supporting Exhibits
  
Dear Immigration Intake Officer,
  
Enclosed please find the initial filing package for **Form ${formType}** submitted on behalf of the applicant designated above. We have prepared this submission packet in complete compliance with USCIS statutory filing directions.
  
#### TABLE OF CONTENTS / CHECKLIST OF DOCUMENTARY EXHIBITS:
1. **Filing Fees**: Check/Form G-1450 Authorization for dynamic filing fees.
2. **Form G-1145**: e-Notification of Application Intake Acceptance.
3. **Primary Petition**: Signed Form ${formType} with all required questions answered.
4. **Biographical Records**: Copy of Passport biodata, visa history and current status documents.
5. **Supporting Credentials**: Certified English translation sheets, qualifications, or certificates.
  
We highly request standard receipt warnings and biometric scheduling. If there are any concerns, please issue notifications accordingly.
  
Respectfully submitted,
  
  
**${applicantLabel.split("\n")[0]}**
*Filing Petitioner / Applicant*`;
  }
}

function getOfflineFallbackChecklist(formType: string) {
  const genericCheck = {
    form: `Form ${formType}`,
    title: `USCIS Petition for Visa Category (${formType})`,
    category: "Standard Form",
    sections: [
      {
        sectionTitle: "1. Mandated Filing Documents",
        items: [
          { name: "Completed USCIS Form", required: true, description: "Signed and dated application forms.", tips: "Do not leave blank entries - use N/A if not applicable." },
          { name: "Government Filing Fee Receipt", required: true, description: "Check, money order, or Form G-1450 credit card authorization.", tips: "Double check current USCIS fee index before sending!" }
        ]
      },
      {
        sectionTitle: "2. Personal Identity Proofs",
        items: [
          { name: "Passport Biographical Page", required: true, description: "Copy of current passport biography and photo page.", tips: "Passport must be valid for at least six upcoming months." },
          { name: "I-94 Arrival/Departure Record", required: false, description: "Copy of current active digital I-94 travel log from CBP.", tips: "Only required if filing inside the United States." }
        ]
      }
    ]
  };

  if (formType === "I-485") {
    return {
      form: "Form I-485",
      title: "Application to Register Permanent Residence or Adjust Status",
      category: "Adjustment of Status / Green Card",
      sections: [
        {
          sectionTitle: "Mandatory Filing Forms",
          items: [
            { name: "Completed Form I-485", required: true, description: "Main adjustment of status application.", tips: "Double-check signatures. Errors trigger immediate rejects." },
            { name: "Form I-693 Medical Exam Report", required: true, description: "Signed and sealed report from a designated civil surgeon.", tips: "Recommend filing concurrently with I-485 to save processing times." },
            { name: "Form G-325A Status History", required: false, description: "Biographical information logs.", tips: "Mostly built directly inside current web releases." }
          ]
        },
        {
          sectionTitle: "Vital Status Certificates",
          items: [
            { name: "Full Birth Certificate", required: true, description: "Official birth registration with both parents listed.", tips: "Must accompany certified English translation if issued in other languages." },
            { name: "Marriage Certificate", required: false, description: "Required for family-spouse adjustments or derivative files.", tips: "Ensure seal is clearly visible on copies." },
            { name: "Divorce Decree (If any)", required: false, description: "Proof of lawful termination of any prior marital blocks.", tips: "Needed to verify legitimate present marriage." }
          ]
        },
        {
          sectionTitle: "Underlying Status Verification",
          items: [
            { name: "Approved Petition Notice (I-797)", required: true, description: "Proof of approved underlying visa like I-140, I-130, or I-526.", tips: "Show current priority dates which must be current in the bulletin." },
            { name: "Visa Entry Stamps & Form I-94", required: true, description: "Most recent lawful admission history into the USA.", tips: "Can be pulled directly from CBP official travel portals online." }
          ]
        }
      ]
    };
  }

  if (formType === "I-140") {
    return {
      form: "Form I-140",
      title: "Immigrant Petition for Alien Workers",
      category: "Employment-Based Permanent Visa",
      sections: [
        {
          sectionTitle: "Filing Base Requirements",
          items: [
            { name: "Form I-140 Signed Cover Sheets", required: true, description: "The core USCIS employer form.", tips: "Employer petitioner signature is required." },
            { name: "Certified ETA Form 9089 PERM", required: true, description: "Approved Labor Certification from the Department of Labor (DOL).", tips: "Must be filed within 180 days of original certification date." }
          ]
        },
        {
          sectionTitle: "Employer Criteria Documents",
          items: [
            { name: "Employer Financial Reports / Tax Return", required: true, description: "Annual report or federal tax return to verify Ability to Pay (ATP).", tips: "Required for employers with under 100 workers." },
            { name: "Company W-2 / Payroll ledgers", required: false, description: "Proof of compensation paid to beneficiary under certified rate.", tips: "Highly strong exhibit to satisfy Ability to pay requirements." }
          ]
        },
        {
          sectionTitle: "Foreign Worker Qualifications",
          items: [
            { name: "Academic Diplomats / Degree Certificates", required: true, description: "Copies of university bachelor or master degree certificates.", tips: "Credentials evaluation report required if degree is non-US." },
            { name: "Employment Reference Letters", required: true, description: "Formal letters from past employers proving required years of skill.", tips: "Must describe job roles and specific technical stack parameters." }
          ]
        }
      ]
    };
  }

  return genericCheck;
}

// Vite middleware for dev or static files serving for production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Express server running on http://localhost:${PORT}`);
  });
}

startServer();
