/**
 * lib/useSpeech.ts
 *
 * Browser speech recognition, wrapped so a component does not have to know any
 * of its quirks.
 *
 * WHY THE BROWSER AND NOT OUR SERVER
 * ----------------------------------
 * The Web Speech API transcribes inside the student's browser. Audio never
 * reaches our servers, so there is no per-minute cost, no audio storage, and no
 * new endpoint. That is the whole reason this feature is free to ship.
 *
 * THE QUIRKS THIS WRAPPER EXISTS TO ABSORB
 * ----------------------------------------
 * 1. **Not standardised.** It is `SpeechRecognition` on some browsers and
 *    `webkitSpeechRecognition` on others, and it is simply absent elsewhere
 *    (notably iOS Safari). `isSupported` is false there and the mic button hides
 *    itself rather than failing on tap.
 * 2. **It stops on its own.** Recognition ends after a pause in speech, even
 *    mid-sentence. `continuous` helps but is not honoured everywhere, so the
 *    caller keeps whatever was transcribed instead of losing it.
 * 3. **Errors arrive as codes**, e.g. "not-allowed" when permission is denied.
 *    They are translated into sentences a student can act on.
 * 4. **It emits interim results** that change as it guesses. Interim text is
 *    shown separately and never used as the final value, so a half-guessed word
 *    cannot end up in the student's notes.
 * 5. **It dies with the component.** Every listener is removed on unmount; a
 *    recognition left running would keep the microphone active after the screen
 *    closes, which is alarming and unfixable without a reload.
 */
import { useCallback, useEffect, useRef, useState } from "react";

/** Minimal shape of the API, since TypeScript's DOM lib does not include it. */
type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechResultEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: { isFinal: boolean; length: number; [i: number]: { transcript: string } };
  };
};

type SpeechErrorEvent = { error: string };

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Turn an error code into something a student can act on. */
function describeSpeechError(code: string, permanent: boolean): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow the microphone in your browser settings, or type instead.";
    case "no-speech":
      return "I did not hear anything. Try again, a little closer to the microphone.";
    case "audio-capture":
      return "No microphone was found. Type instead, or check your device.";
    case "network":
      return "The browser's speech service could not be reached. Check your connection, or type instead.";
    case "aborted":
      return "";
    default:
      return "Voice input stopped before it could be used. You can try again or type instead.";
  }
}

export type SpeechState = "idle" | "listening" | "error";

export function useSpeech({
  lang = "en-ZA",
  onFinal,
}: {
  lang?: string;
  /**
   * Called with the FINAL transcript only. The caller appends it to whatever is
   * already in the field, so speaking twice adds to the text instead of
   * replacing it.
   */
  onFinal: (text: string) => void;
}) {
  const [isSupported] = useState<boolean>(() => getRecognitionCtor() !== null);
  const [state, setState] = useState<SpeechState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Kept in a ref so the event handlers always see the latest callback without
  // re-creating the recognition object on every render.
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  const stop = useCallback(() => {
    setInterim("");
    const rec = recognitionRef.current;
    if (rec) {
      // `abort` rather than `stop`: stop waits for a final result that may never
      // come, leaving the microphone open for another second.
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    }
    recognitionRef.current = null;
    setState("idle");
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    setError("");
    setInterim("");

    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    // Interim results are what make the button feel responsive: the student sees
    // words appearing as they speak.
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onstart = () => setState("listening");

    rec.onresult = (event) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) finalText += transcript;
        else interimText += transcript;
      }
      setInterim(interimText);
      if (finalText.trim()) {
        onFinalRef.current(finalText.trim());
        setInterim("");
      }
    };

    rec.onerror = (event) => {
      const message = describeSpeechError(event.error, true);
      // "aborted" is our own stop, not a failure.
      if (event.error === "aborted") return;
      if (message) {
        setError(message);
        setState("error");
      }
      // A denied microphone must not be retried automatically - the browser will
      // not prompt again, and a silent retry looks like the button is broken.
      recognitionRef.current = null;
    };

    rec.onend = () => {
      // Fires after a natural pause as well as after stop(). Only clear the
      // listening state if we are not already in error.
      setInterim("");
      setState((prev) => (prev === "error" ? prev : "idle"));
      recognitionRef.current = null;
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch {
      // start() throws if it is already running; treat as listening.
      setState("listening");
    }
  }, [lang]);

  const toggle = useCallback(() => {
    if (state === "listening") stop();
    else start();
  }, [state, start, stop]);

  // Release the microphone if the screen changes while listening.
  useEffect(() => () => stop(), [stop]);

  return {
    isSupported,
    state,
    interim,
    error,
    isListening: state === "listening",
    start,
    stop,
    toggle,
    clearError: () => setError(""),
  };
}
