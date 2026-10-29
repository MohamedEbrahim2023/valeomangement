import { RetrievedChunkResult } from './local-rag-engine.ts';

export type InBrowserModelId =
  | 'onnx-community/Qwen2.5-0.5B-Instruct'
  | 'HuggingFaceTB/SmolLM2-135M-Instruct';

export interface InBrowserLlmProgress {
  status: 'idle' | 'downloading' | 'ready' | 'generating' | 'error';
  progress: number; // 0..100
  file?: string;
  loadedModelId?: InBrowserModelId | null;
  error?: string;
}

let generatorPipeline: any = null;
let transformersModuleCache: any = null;
let currentLoadedModel: InBrowserModelId | null = null;
let isLoadingPromise: Promise<any> | null = null;

async function getTransformersModule() {
  if (!transformersModuleCache) {
    const cdnUrl = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3';
    const mod = await import(/* @vite-ignore */ cdnUrl);
    mod.env.allowLocalModels = false;
    mod.env.useBrowserCache = true;
    transformersModuleCache = mod;
  }
  return transformersModuleCache;
}

/**
 * Checks whether WebGPU is available in the user's browser for hardware acceleration.
 * Falls back automatically to WebAssembly (WASM) on phones and standard browsers.
 */
async function detectBestDevice(): Promise<'webgpu' | 'wasm'> {
  try {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) return 'webgpu';
    }
  } catch {
    // Ignore and fall back to WASM
  }
  return 'wasm';
}

export async function initInBrowserLlm(
  modelId: InBrowserModelId = 'onnx-community/Qwen2.5-0.5B-Instruct',
  onProgress?: (state: InBrowserLlmProgress) => void
): Promise<any> {
  if (generatorPipeline && currentLoadedModel === modelId) {
    onProgress?.({
      status: 'ready',
      progress: 100,
      loadedModelId: modelId,
    });
    return generatorPipeline;
  }

  if (isLoadingPromise) {
    return isLoadingPromise;
  }

  onProgress?.({
    status: 'downloading',
    progress: 2,
    loadedModelId: modelId,
  });

  isLoadingPromise = (async () => {
    try {
      const { pipeline } = await getTransformersModule();
      const device = await detectBestDevice();
      const pipe = await pipeline('text-generation', modelId, {
        dtype: 'q4',
        device,
        progress_callback: (info: any) => {
          if (info.status === 'progress' && typeof info.progress === 'number') {
            onProgress?.({
              status: 'downloading',
              progress: Math.min(99, Math.max(5, Math.round(info.progress))),
              file: info.file,
              loadedModelId: modelId,
            });
          }
        },
      });

      generatorPipeline = pipe;
      currentLoadedModel = modelId;
      onProgress?.({
        status: 'ready',
        progress: 100,
        loadedModelId: modelId,
      });
      return pipe;
    } catch (err: any) {
      onProgress?.({
        status: 'error',
        progress: 0,
        loadedModelId: null,
        error: err?.message || 'Failed to initialize in-browser ONNX model',
      });
      throw err;
    } finally {
      isLoadingPromise = null;
    }
  })();

  return isLoadingPromise;
}

export function isInBrowserLlmReady(): boolean {
  return Boolean(generatorPipeline);
}

export function getLoadedInBrowserModelId(): InBrowserModelId | null {
  return currentLoadedModel;
}

/**
 * Generates an interactive response directly inside the browser using the loaded
 * quantized ONNX LLM (Qwen2.5-0.5B-Instruct or SmolLM2-135M-Instruct) grounded
 * with the top retrieved RAG chunks and synthesized facts.
 */
export async function generateWithInBrowserLlm(params: {
  query: string;
  retrievedChunks: RetrievedChunkResult[];
  groundedBaselineReply: string;
  groundedBullets: string[];
  lang: 'ar' | 'en';
  modelId?: InBrowserModelId;
  onTokenStream?: (partialText: string) => void;
  onProgress?: (state: InBrowserLlmProgress) => void;
}): Promise<string> {
  const modelId = params.modelId || 'onnx-community/Qwen2.5-0.5B-Instruct';
  const { TextStreamer } = await getTransformersModule();
  const pipe = await initInBrowserLlm(modelId, params.onProgress);

  params.onProgress?.({
    status: 'generating',
    progress: 100,
    loadedModelId: modelId,
  });

  const topContext = params.retrievedChunks
    .slice(0, 2)
    .map((c) => c.text)
    .join('\n---\n');

  const factsSummary = [
    params.groundedBaselineReply,
    ...params.groundedBullets.slice(0, 4),
  ].join('\n');

  const messages = [
    {
      role: 'system',
      content:
        params.lang === 'ar'
          ? `أنت "عبدك المطيغ"، مساعد ذكي ومرح جداً داخل الموقع. أجب باللغة العربية باختصار وروح مرحة ودقة تامة بناءً على البيانات الحقيقية التالية فقط:\n${factsSummary}\n\nسياق إضافي:\n${topContext}`
          : `You are "Abdak Al-Moti'gh", a cheerful and smart in-browser AI assistant. Answer concisely and accurately in English based strictly on these verified site facts:\n${factsSummary}\n\nAdditional context:\n${topContext}`,
    },
    {
      role: 'user',
      content: params.query,
    },
  ];

  let streamedText = '';
  const streamer = new TextStreamer(pipe.tokenizer, {
    skip_prompt: true,
    skip_special_tokens: true,
    callback_function: (tokenText: string) => {
      streamedText += tokenText;
      params.onTokenStream?.(streamedText);
    },
  });

  const output = await pipe(messages, {
    max_new_tokens: 180,
    temperature: 0.25,
    do_sample: true,
    top_p: 0.9,
    streamer,
  });

  params.onProgress?.({
    status: 'ready',
    progress: 100,
    loadedModelId: modelId,
  });

  const generated =
    streamedText.trim() ||
    (Array.isArray(output) &&
      output[0]?.generated_text &&
      Array.isArray(output[0].generated_text)
      ? output[0].generated_text[output[0].generated_text.length - 1]?.content
      : '');

  return (generated || params.groundedBaselineReply).trim();
}
