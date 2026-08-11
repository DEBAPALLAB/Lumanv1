"use client";

import { useState } from "react";
import Link from "next/link";
import { HelpCircle, ChevronDown, Send, MessageSquare } from "lucide-react";

export default function SupportPage() {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", topic: "", message: "" });

  const faqs = [
    {
      q: "What is Luman and how does it help my team?",
      a: "Luman is a beautiful, highly polished workspace designed to help teams align their thoughts and execute goals. It brings your rich-text documents, action checklists, and shared team calendars together in one single, high-contrast workspace.",
    },
    {
      q: "How do I invite colleagues to my organization?",
      a: "Inviting team members is simple. Once you create your organization workspace, you can generate a secure invite code from your dashboard settings. Teammates can use this code to register and join your shared directories instantly.",
    },
    {
      q: "Can I organize documents into folders?",
      a: "Yes! Luman lets you group related notes and strategy documents into custom directories. You can even color-code your folders to visually separate different projects, departments, or client channels.",
    },
    {
      q: "How does the built-in AI Assistant help me write?",
      a: "The AI Assistant sits right next to your document editor in the sidebar. You can highlight any sentence to summarize goals, fix grammar, or rewrite text in one click, or use the chat prompt to brainstorm plans and strategies with ease.",
    },
    {
      q: "How do calendar schedules and tasks sync?",
      a: "Luman connects your calendar events and workspace checklists directly. You can schedule events inside a document that automatically show up on your monthly team calendar grid, while checking off tasks updates your project completion status in real-time.",
    },
  ];

  const handleToggle = (idx: number) => {
    setExpandedIdx(expandedIdx === idx ? null : idx);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setTimeout(() => {
      setSubmitted(false);
      setForm({ name: "", email: "", topic: "", message: "" });
    }, 3000);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 space-y-16">
      
      {/* Header */}
      <div className="space-y-4 max-w-3xl">
        <div className="inline-block px-3 py-1 border border-black bg-accent text-accent-foreground text-xs font-black uppercase shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
          ⚡ SUPPORT DESK
        </div>
        <h1 className="text-4xl sm:text-6xl font-black uppercase text-foreground leading-none">
          HELP & SUPPORT
        </h1>
        <p className="text-sm font-bold uppercase text-muted-foreground leading-relaxed">
          Review our simple team guides or send a support ticket directly to our product success team.
        </p>
      </div>

      <hr className="border-2 border-black" />

      {/* Main Grid: FAQs on left, Ticket Form on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 pt-6">
        
        {/* Left Column: Interactive FAQ Accordion (7 Columns) */}
        <div className="lg:col-span-7 space-y-6">
          <h2 className="text-2xl font-black uppercase text-foreground flex items-center gap-2 pb-2 border-b-2 border-black w-max">
            <HelpCircle className="h-6 w-6" />
            COMMON QUESTIONS
          </h2>

          <div className="space-y-4">
            {faqs.map((faq, idx) => {
              const isOpen = expandedIdx === idx;
              return (
                <div 
                  key={idx}
                  className="border-brutal bg-card hover:bg-muted/10 transition-colors shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] rounded-sm"
                >
                  <button
                    type="button"
                    onClick={() => handleToggle(idx)}
                    className="w-full px-6 py-5 text-left flex items-center justify-between gap-4 select-none focus:outline-none"
                  >
                    <span className="text-sm font-black uppercase text-foreground">
                      {faq.q}
                    </span>
                    <ChevronDown 
                      className={`h-5 w-5 text-foreground shrink-0 transition-transform duration-300 ${
                        isOpen ? "transform rotate-180" : ""
                      }`} 
                    />
                  </button>
                  
                  {/* Expandable Panel */}
                  <div 
                    className={`transition-all duration-300 ease-in-out overflow-hidden border-t-2 border-black bg-background/50 ${
                      isOpen ? "max-h-[300px] opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                    }`}
                  >
                    <p className="px-6 py-5 text-xs font-semibold uppercase leading-relaxed text-muted-foreground font-sans normal-case">
                      {faq.a}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Support Ticket Submission Form (5 Columns) */}
        <div className="lg:col-span-5 border-brutal-thick shadow-brutal-lg bg-card p-8 flex flex-col justify-between">
          <div className="space-y-6">
            <h2 className="text-2xl font-black uppercase text-foreground flex items-center gap-2 pb-2 border-b-2 border-black">
              <MessageSquare className="h-6 w-6" />
              SEND A MESSAGE
            </h2>

            {submitted ? (
              <div className="p-6 border-2 border-black bg-accent text-accent-foreground text-center font-black uppercase text-xs space-y-2 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <p>⚡ TICKET SUBMITTED SUCCESSFULLY!</p>
                <p className="text-[10px] text-accent-foreground/80 font-bold">Our support team will get in touch with you shortly.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                
                <div className="space-y-1.5">
                  <label htmlFor="name" className="block text-[10px] font-black uppercase">FULL NAME</label>
                  <input
                    id="name"
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="ENTER YOUR FULL NAME"
                    className="w-full border-2 border-black px-4 py-2.5 text-xs font-bold uppercase bg-background text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="email" className="block text-[10px] font-black uppercase">EMAIL ADDRESS</label>
                  <input
                    id="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="ENTER YOUR EMAIL ADDRESS"
                    className="w-full border-2 border-black px-4 py-2.5 text-xs font-bold uppercase bg-background text-foreground placeholder:text-muted-foreground focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="topic" className="block text-[10px] font-black uppercase">TOPIC</label>
                  <select
                    id="topic"
                    required
                    value={form.topic}
                    onChange={(e) => setForm({ ...form, topic: e.target.value })}
                    className="w-full border-2 border-black px-4 py-2.5 text-xs font-bold uppercase bg-background text-foreground focus:outline-none"
                  >
                    <option value="">SELECT A TOPIC</option>
                    <option value="workspace">WORKSPACE & DIRECTORIES</option>
                    <option value="billing">BILLING & PLANS</option>
                    <option value="ai">AI ASSISTANT SIDEBAR</option>
                    <option value="other">GENERAL SUPPORT</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="message" className="block text-[10px] font-black uppercase">MESSAGE DETAILS</label>
                  <textarea
                    id="message"
                    required
                    rows={4}
                    value={form.message}
                    onChange={(e) => setForm({ ...form, message: e.target.value })}
                    placeholder="HOW CAN WE HELP YOU today?"
                    className="w-full border-2 border-black px-4 py-2.5 text-xs font-bold uppercase bg-background text-foreground placeholder:text-muted-foreground focus:outline-none resize-none"
                  />
                </div>

                <button
                  type="submit"
                  className="w-full py-4 text-xs font-black uppercase border border-black bg-accent text-accent-foreground shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] hover:shadow-none hover:translate-x-[3px] hover:translate-y-[3px] transition-all flex items-center justify-center gap-2"
                >
                  SEND MESSAGE
                  <Send className="h-4 w-4" />
                </button>
                
              </form>
            )}
          </div>
        </div>

      </div>

    </div>
  );
}


