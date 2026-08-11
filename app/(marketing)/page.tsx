"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  Sparkles, 
  Play, 
  ArrowRight, 
  CheckSquare, 
  Square, 
  Terminal, 
  Lock, 
  UploadCloud, 
  Check, 
  Calendar, 
  ListTodo,
  Code,
  FileText
} from "lucide-react";

export default function LandingPage() {
  // Task checklist state for interactive widget
  const [tasks, setTasks] = useState([
    { id: 1, text: "Draft launch goals", completed: true },
    { id: 2, text: "Finalize team layout specifications", completed: false },
    { id: 3, text: "Schedule calendar planning sync", completed: false },
    { id: 4, text: "Test document writing editor", completed: true },
  ]);

  // AI Prompt Stream State for interactive editor widget
  const [aiPromptInput, setAiPromptInput] = useState("Summarize our launch strategy");
  const [aiResponse, setAiResponse] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const toggleTask = (id: number) => {
    setTasks(
      tasks.map((task) =>
        task.id === id ? { ...task, completed: !task.completed } : task
      )
    );
  };

  const simulateAISummarize = () => {
    if (isTyping) return;
    setIsTyping(true);
    setAiResponse("");
    const text = "Luman helps your team write clean documents, coordinate calendar timelines, and track action items in a single shared workspace. Focus on execution and keep everyone on the same page.";
    let index = 0;
    const interval = setInterval(() => {
      if (index < text.length) {
        setAiResponse((prev) => prev + text.charAt(index));
        index++;
      } else {
        clearInterval(interval);
        setIsTyping(false);
      }
    }, 20);
  };

  // Trigger one simulation on load
  useEffect(() => {
    simulateAISummarize();
  }, []);

  const completedCount = tasks.filter((t) => t.completed).length;
  const progressPercent = Math.round((completedCount / tasks.length) * 100);

  return (
    <div className="max-w-6xl mx-auto px-6 space-y-28 md:space-y-36">
      
      {/* 1. HERO SECTION */}
      <section className="text-center space-y-8 relative py-8">
        
        {/* Release Status Badge */}
        <div className="inline-flex items-center gap-2 bg-card border border-black rounded-sm px-4 py-1.5 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] dark:shadow-[2px_2px_0px_0px_rgba(255,255,255,1)]">
          <span className="w-2 h-2 rounded-full bg-green-500 border border-black animate-pulse" />
          <span className="text-xs font-black uppercase tracking-wider text-foreground">
            Luman workspace is live
          </span>
        </div>

        {/* Headline */}
        <div className="space-y-4 max-w-4xl mx-auto">
          <h1 className="text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tight text-foreground leading-[1.05]">
            Organize your <span className="bg-accent text-accent-foreground px-3 inline-block transform -rotate-1 border border-black shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">ideas</span>.
            <br />
            Coordinate your <span className="bg-foreground text-background px-3 inline-block transform rotate-1">team</span>.
          </h1>
          <p className="text-sm sm:text-lg md:text-xl font-bold uppercase text-muted-foreground max-w-2xl mx-auto pt-4 leading-relaxed">
            Luman is a beautifully structured team workspace. Write clear documents, schedule project timelines, and manage tasks side-by-side with a helpful AI writing partner.
          </p>
        </div>

        {/* Hero CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
          <Link
            href="/org-register"
            className="w-full sm:w-auto px-8 py-4 text-base font-black uppercase border-2 border-black bg-accent text-accent-foreground shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[5px] hover:translate-y-[5px] transition-all flex items-center justify-center gap-2"
          >
            Create Your Workspace
            <ArrowRight className="h-5 w-5" />
          </Link>
          
          <Link
            href="/features"
            className="w-full sm:w-auto px-8 py-4 text-base font-black uppercase border-2 border-black bg-background text-foreground shadow-[5px_5px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[5px] hover:translate-y-[5px] transition-all flex items-center justify-center gap-2"
          >
            Explore Features
          </Link>
        </div>
      </section>

      {/* 2. INTERACTIVE PRODUCT PREVIEW CARD */}
      <section className="space-y-6">
        <div className="text-center space-y-2">
          <h2 className="text-2xl sm:text-4xl font-black uppercase text-foreground">
            Experience Luman
          </h2>
          <p className="text-xs sm:text-sm font-bold uppercase text-muted-foreground">
            Click tasks to complete them, or type a prompt and ask the AI
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch pt-6">
          
          {/* Left Block - Interactive Editor Mockup (7 Columns) */}
          <div className="lg:col-span-7 border-brutal-thick shadow-brutal-xl bg-card p-6 flex flex-col justify-between min-h-[450px]">
            <div className="space-y-6">
              
              {/* Window Header */}
              <div className="flex items-center justify-between pb-4 border-b-2 border-black">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500 border border-black" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500 border border-black" />
                  <div className="w-3 h-3 rounded-full bg-green-500 border border-black" />
                </div>
                <div className="px-3 py-1 border border-black text-[10px] font-black uppercase bg-muted">
                  Luman Document Editor
                </div>
              </div>

              {/* Editor Content */}
              <div className="space-y-4 font-mono text-sm">
                <h3 className="text-lg font-black uppercase text-foreground">
                  📝 Product Launch Strategy.md
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  We are launching <span className="bg-[#fbf4a2] text-black px-1.5 py-0.5 border border-dashed border-yellow-600 font-bold">Luman</span> to bring teams a fast, beautiful workspace. Write, schedule, and execute seamlessly. 
                </p>
                <div className="p-3 border border-black bg-muted/30 rounded-sm font-bold text-xs uppercase flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-black text-white rounded-[3px]">/table</span>
                  <span>Insert tables for timelines and goals</span>
                </div>
                <div className="p-3 border border-black bg-muted/30 rounded-sm font-bold text-xs uppercase flex items-center gap-2">
                  <span className="px-1.5 py-0.5 bg-black text-white rounded-[3px]">/schedule</span>
                  <span>Pin an event directly to the calendar</span>
                </div>
              </div>
            </div>

            {/* AI Assistant preview */}
            <div className="mt-8 border-2 border-black p-4 bg-background relative shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
              <div className="absolute -top-3.5 left-4 px-2 bg-accent text-accent-foreground text-[10px] font-black uppercase border border-black flex items-center gap-1.5">
                <Terminal className="h-3 w-3" />
                AI Assistant
              </div>
              
              <div className="space-y-3 pt-1">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={aiPromptInput}
                    onChange={(e) => setAiPromptInput(e.target.value)}
                    className="flex-grow px-3 py-1.5 text-xs font-bold uppercase border border-black bg-card text-foreground focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={simulateAISummarize}
                    disabled={isTyping}
                    className="px-3 py-1.5 text-xs font-black uppercase border border-black bg-accent text-accent-foreground shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:scale-95 disabled:opacity-50"
                  >
                    {isTyping ? "Writing..." : "Ask AI"}
                  </button>
                </div>
                
                <div className="min-h-[60px] bg-muted/50 border border-black p-3 text-xs font-semibold text-foreground leading-relaxed uppercase">
                  {aiResponse ? aiResponse : <span className="text-muted-foreground animate-pulse">Click "Ask AI" to stream responses...</span>}
                  {isTyping && <span className="inline-block w-1.5 h-3 bg-foreground ml-1 animate-ping" />}
                </div>
              </div>
            </div>

          </div>

          {/* Right Block - Interactive Checklist & Calendar Dot Widget (5 Columns) */}
          <div className="lg:col-span-5 border-brutal-thick shadow-brutal-xl bg-card p-6 flex flex-col justify-between min-h-[450px]">
            
            {/* Calendar Header Card */}
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-4 border-b-2 border-black">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  <span className="text-sm font-black uppercase tracking-wider text-foreground">
                    Team Schedule
                  </span>
                </div>
                <div className="px-2 py-0.5 bg-black text-white text-[9px] font-black rounded-sm">
                  {progressPercent}% Complete
                </div>
              </div>

              {/* Simulated Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 text-center font-bold text-[10px]">
                {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
                  <div key={i} className="text-muted-foreground py-1 font-black">{d}</div>
                ))}
                {Array.from({ length: 28 }).map((_, i) => {
                  const dayNum = i + 1;
                  const hasEvent = dayNum === 3 || dayNum === 14 || dayNum === 25;
                  return (
                    <div
                      key={i}
                      className={`py-1.5 border border-muted-foreground/20 relative rounded-sm ${
                        hasEvent ? "bg-accent/40 font-black border-black" : ""
                      }`}
                    >
                      {dayNum}
                      {hasEvent && (
                        <span className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-red-600" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Interactive Checklist */}
            <div className="space-y-3 pt-6 border-t-2 border-black mt-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black uppercase flex items-center gap-1.5">
                  <ListTodo className="h-4 w-4" />
                  Team Action Items
                </span>
                <span className="text-[10px] font-black uppercase text-accent bg-black px-1.5 py-0.5 rounded-sm">
                  {completedCount} of {tasks.length} Done
                </span>
              </div>
              
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    className="flex items-center gap-3 p-3 border border-black bg-background hover:bg-muted/40 transition-colors cursor-pointer select-none rounded-sm"
                  >
                    {task.completed ? (
                      <CheckSquare className="h-5 w-5 text-green-600 shrink-0" />
                    ) : (
                      <Square className="h-5 w-5 shrink-0" />
                    )}
                    <span
                      className={`text-xs font-bold uppercase ${
                        task.completed ? "line-through text-muted-foreground" : "text-foreground"
                      }`}
                    >
                      {task.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* 3. CORE BENEFITS SECTION */}
      <section className="space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-3xl sm:text-5xl font-black uppercase text-foreground">
            EVERYTHING IN ONE PLACE
          </h2>
          <p className="text-sm font-bold uppercase text-muted-foreground">
            Ditch scattered tabs. Luman brings your writing documents, schedules, and team assignments into a single visual environment.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 pt-6">
          
          {/* Benefit 1 */}
          <div className="border-brutal-thick shadow-brutal bg-[#93C5FD] text-black p-8 space-y-4 hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all">
            <div className="p-3 border-2 border-black bg-white rounded-sm w-max">
              <Code className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-black uppercase">Smart Shortcuts</h3>
            <p className="text-xs font-semibold uppercase leading-relaxed text-black/80">
              Add structured tables, checklist grids, or calendar sync dates instantly. Just press the "/" key as you type and select what you need.
            </p>
          </div>

          {/* Benefit 2 */}
          <div className="border-brutal-thick shadow-brutal bg-[#FCA5A5] text-black p-8 space-y-4 hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all">
            <div className="p-3 border-2 border-black bg-white rounded-sm w-max">
              <Lock className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-black uppercase">Safe Team Roles</h3>
            <p className="text-xs font-semibold uppercase leading-relaxed text-black/80">
              Keep your sensitive plans and assets safe. Founders hold full administrative setup control, while team members can view or write without breaking folder directories.
            </p>
          </div>

          {/* Benefit 3 */}
          <div className="border-brutal-thick shadow-brutal bg-[#FCD34D] text-black p-8 space-y-4 hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all">
            <div className="p-3 border-2 border-black bg-white rounded-sm w-max">
              <UploadCloud className="h-6 w-6" />
            </div>
            <h3 className="text-xl font-black uppercase">Easy File Sharing</h3>
            <p className="text-xs font-semibold uppercase leading-relaxed text-black/80">
              Drag and drop images, PDFs, and spreadsheets directly into your text editor. Files load immediately, giving everyone instant access.
            </p>
          </div>

        </div>
      </section>

      {/* 4. VIBRANT CTA BANNER */}
      <section>
        <div className="border-brutal-mega shadow-brutal-xl bg-accent text-accent-foreground p-12 md:p-16 text-center space-y-8 relative overflow-hidden rounded-md">
          <div className="absolute top-2 right-2 p-2 border border-black rounded-sm bg-background text-foreground transform rotate-12 text-xs font-black uppercase">
            ⚡ SPAWN ORG
          </div>
          
          <div className="space-y-4 max-w-3xl mx-auto">
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black uppercase leading-none">
              READY TO SPAWN YOUR WORKSPACE?
            </h2>
            <p className="text-xs sm:text-sm font-bold uppercase max-w-xl mx-auto leading-relaxed">
              Create a secure private home for your team's documents, projects, and calendar events. Set up in less than 60 seconds.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 max-w-md mx-auto pt-2">
            <Link
              href="/org-register"
              className="w-full sm:w-auto px-8 py-4 text-sm font-black uppercase border-2 border-black bg-foreground text-background shadow-[4px_4px_0px_0px_rgba(255,255,255,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
            >
              Get Started Free
            </Link>
            
            <Link
              href="/org-login"
              className="w-full sm:w-auto px-8 py-4 text-sm font-black uppercase border-2 border-black bg-background text-foreground shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
            >
              Log In Workspace
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
