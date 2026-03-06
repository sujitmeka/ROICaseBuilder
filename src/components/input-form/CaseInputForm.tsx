"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition, useCallback } from "react";
import { caseInputSchema, type CaseInput } from "../../lib/schemas";
import { CompanyAutocomplete } from "./CompanyAutocomplete";
import { ServiceTypeSelect } from "./ServiceTypeSelect";

export function CaseInputForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<{ fileName: string; fileType: string } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CaseInput>({
    resolver: zodResolver(caseInputSchema),
    defaultValues: {
      companyName: "",
      serviceType: "experience-transformation-design",
      projectContext: "",
    },
  });

  register("companyName");
  register("serviceType");

  const handleFileUpload = useCallback(async (file: File) => {
    setIsUploading(true);
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Upload failed");
      }
      const { text, fileName, fileType } = await res.json();
      setValue("documentContent", text);
      setUploadedFile({ fileName, fileType });
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed");
      setValue("documentContent", undefined);
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
    }
  }, [setValue]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === "application/pdf" || file.name.endsWith(".docx"))) {
      handleFileUpload(file);
    } else {
      setUploadError("Please upload a PDF or Word document");
    }
  }, [handleFileUpload]);

  async function onSubmit(data: CaseInput) {
    setIsSubmitting(() => true);
    setSubmitError(() => null);
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server error (${res.status})`);
      }
      const { caseId } = await res.json();
      startTransition(() => {
        router.push(`/cases/${caseId}`);
      });
    } catch (err) {
      setSubmitError(() => err instanceof Error ? err.message : "Something went wrong");
      setIsSubmitting(() => false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* RFP Upload — drag and drop zone */}
      <div>
        <label className="block text-sm font-medium text-[#a8a8a8] mb-1">
          Upload RFP or Brief <span className="text-[#707070] font-normal">(optional)</span>
        </label>
        {uploadedFile ? (
          <div className="flex items-center gap-2 rounded-sm border border-[#2a2a2a] bg-[#111111] px-4 py-3 text-sm">
            <svg className="h-4 w-4 text-[#707070] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span className="text-white">{uploadedFile.fileName}</span>
            <button
              type="button"
              onClick={() => {
                setUploadedFile(null);
                setValue("documentContent", undefined);
              }}
              className="ml-auto text-[#707070] hover:text-white text-xs"
            >
              Remove
            </button>
          </div>
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`relative flex flex-col items-center justify-center rounded-sm border border-dashed py-8 px-4 transition-colors cursor-pointer ${
              isDragOver
                ? "border-white bg-[#1a1a1a]"
                : "border-[#2a2a2a] bg-[#0a0a0a] hover:border-[#707070]"
            }`}
          >
            <svg className="h-8 w-8 text-[#707070] mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-sm text-[#a8a8a8]">
              {isUploading ? "Extracting document text..." : "Drag and drop a PDF or Word document"}
            </p>
            <p className="text-xs text-[#707070] mt-1">or</p>
            <label className="mt-2 cursor-pointer rounded-sm border border-[#2a2a2a] bg-[#111111] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#1a1a1a] transition-colors">
              Browse files
              <input
                type="file"
                accept=".pdf,.docx"
                disabled={isUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
                className="sr-only"
              />
            </label>
          </div>
        )}
        {uploadError && <p className="mt-1 text-sm text-red-400">{uploadError}</p>}
      </div>

      {/* Company Name */}
      <div>
        <label htmlFor="companyName" className="block text-sm font-medium text-[#a8a8a8] mb-1">
          Company Name
        </label>
        <CompanyAutocomplete
          value={watch("companyName")}
          onChange={(val) => setValue("companyName", val)}
        />
        {errors.companyName && (
          <p className="mt-1 text-sm text-red-400">
            {errors.companyName.message}
          </p>
        )}
      </div>

      {/* Project Context — required */}
      <div>
        <label className="block text-sm font-medium text-[#a8a8a8] mb-1">
          Project Context
        </label>
        <p className="text-xs text-[#707070] mb-1">
          Describe the engagement: what part of the business, what problems you{"'"}re solving, what{"'"}s changing.
        </p>
        <textarea
          {...register("projectContext")}
          rows={4}
          maxLength={5000}
          placeholder="e.g. Nike wants to redesign their mobile checkout experience to reduce cart abandonment. The engagement focuses on the direct-to-consumer digital channel..."
          className="w-full rounded-sm border border-[#2a2a2a] bg-[#0a0a0a] px-3 py-2 text-sm text-white placeholder:text-[#707070] focus:border-white focus:ring-1 focus:ring-white focus:outline-none resize-y"
        />
        {errors.projectContext && (
          <p className="mt-1 text-sm text-red-400">{errors.projectContext.message}</p>
        )}
      </div>

      {/* Service Type + Project Cost — side by side */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="serviceType" className="block text-sm font-medium text-[#a8a8a8] mb-1">
            Service Type
          </label>
          <ServiceTypeSelect
            value={watch("serviceType") ?? "experience-transformation-design"}
            onChange={(val) => setValue("serviceType", val as CaseInput["serviceType"])}
          />
          {errors.serviceType && (
            <p className="mt-1 text-sm text-red-400">
              {errors.serviceType.message}
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="estimatedProjectCost"
            className="block text-sm font-medium text-[#a8a8a8] mb-1"
          >
            Estimated Project Cost
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#707070] text-sm">
              $
            </span>
            <input
              id="estimatedProjectCost"
              type="number"
              min="1"
              step="any"
              placeholder="e.g. 500000"
              {...register("estimatedProjectCost", { valueAsNumber: true })}
              className="w-full rounded-sm border border-[#2a2a2a] bg-[#0a0a0a] pl-7 pr-3 py-2 text-sm text-white placeholder:text-[#707070] focus:border-white focus:ring-1 focus:ring-white focus:outline-none"
            />
          </div>
          {errors.estimatedProjectCost && (
            <p className="mt-1 text-sm text-red-400">
              {errors.estimatedProjectCost.message}
            </p>
          )}
        </div>
      </div>

      {submitError && (
        <p className="text-sm text-red-400 bg-red-950/50 border border-red-900/50 rounded-sm p-3">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting || isPending || isUploading}
        className="w-full rounded-sm bg-white px-4 py-2 text-sm font-medium text-black hover:bg-[#e0e0e0] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isSubmitting ? "Starting analysis..." : isPending ? "Navigating..." : "Generate ROI Case"}
      </button>
    </form>
  );
}
