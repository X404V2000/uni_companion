/**
 * app/(tabs)/summaries.tsx — AI summaries.
 *
 * THE CONSENT GATE LIVE HERE
 * --------------------------
 * Per the product decision, the POPIA consent sheet appears at the first AI
 * summary — the moment the student first benefits from the feature, which is when
 * the ask is both least annoying and most meaningful ("specific and informed" is
 * what POPIA actually asks for).
 *
 * The gate is deliberately NOT blocking. Declining dismisses the sheet and the
 * summary still runs. Only telemetry is gated on consent; the feature itself
 * belongs to the student either way. Blocking a feature behind a consent prompt
 * is how you teach people to tap "Allow" without reading.
 *
 * WHY THE SHEET IS SHOWN ONCE
 * ---------------------------
 * `useConsent` holds a tri-state: null means "not yet known". Treating null as
 * "declined" would re-ask a student who already agreed, on every launch. The sheet
 * only opens when the state is known to be false, and an in-memory flag stops it
 * reopening within the same session after a decline.
 */
import { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card, ScreenHeader } from "../../src/components/ui";
import { StaleBanner } from "../../src/components/StaleBanner";
import { useConsent } from "../../src/lib/consent";
import { describeError, isStaleAfterFailure, useModules, useSummarize } from "../../src/lib/queries";
import { colors, radius, space, type as typography } from "../../src/theme";

/**
 * The shortest content that can usefully be summarised.
 *
 * Measured on the student's own text, never on a label we add. The web client
 * once counted its own "[From file]" prefix toward this budget, so a 20-character
 * file passed a 50-character check it should have failed.
 */
const MIN_CONTENT = 20;

export default function SummariesScreen() {
  const insets = useSafeAreaInsets();

  const modules = useModules();
  const summarize = useSummarize();
  const consent = useConsent();

  const [moduleCode, setModuleCode] = useState("");
  const [content, setContent] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showConsent, setShowConsent] = useState(false);
  // Set once the student declines, so the sheet does not reopen on the next
  // attempt within this session. A fresh session asks again, which is correct -
  // they may have changed their mind.
  const declinedThisSession = useRef(false);

  const moduleList = modules.data ?? [];
  const effectiveModule = moduleCode || moduleList[0]?.code || "GENERAL";
  const trimmedLength = content.trim().length;
  const canSubmit = trimmedLength >= MIN_CONTENT && !summarize.isPending;

  /** Decide whether the consent sheet should interrupt this submission. */
  function shouldAskConsent(): boolean {
    if (consent.loading) return false; // never ask while the answer is unknown
    if (consent.granted) return false;
    if (declinedThisSession.current) return false;
    return true;
  }

  async function runSummary() {
    setError(null);
    setShowConsent(false);

    try {
      const text = await summarize.mutateAsync({
        moduleCode: effectiveModule,
        content: content.trim(),
      });
      setResult(typeof text === "string" ? text : JSON.stringify(text));
    } catch (e) {
      setError(describeError(e));
    }
  }

  function submit() {
    setError(null);
    if (trimmedLength < MIN_CONTENT) {
      setError(`Paste at least ${MIN_CONTENT} characters so there is something to work with.`);
      return;
    }
    if (shouldAskConsent()) {
      setShowConsent(true);
      return;
    }
    void runSummary();
  }

  return (
    <View style={styles.flex}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView
          contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
          keyboardShouldPersistTaps="handled"
        >
          {isStaleAfterFailure(modules) ? (
            <StaleBanner
              onRetry={() => void modules.refetch()}
              dataUpdatedAt={modules.dataUpdatedAt}
            />
          ) : null}

          <ScreenHeader
            title="AI Summaries"
            subtitle="Paste your notes and get a structured study guide"
          />

          {moduleList.length === 0 ? (
            <Card>
              <Text style={styles.muted}>
                Add a module in Settings first — summaries are organised by module.
              </Text>
            </Card>
          ) : (
            <>
              <Text style={styles.fieldLabel}>Module</Text>
              <View style={styles.chips}>
                {moduleList.map((m) => (
                  <Button
                    key={m.id}
                    label={m.code}
                    variant={effectiveModule === m.code ? "primary" : "secondary"}
                    onPress={() => setModuleCode(m.code)}
                  />
                ))}
              </View>

              <Text style={styles.fieldLabel}>Your notes</Text>
              <TextInput
                value={content}
                onChangeText={setContent}
                placeholder="Paste lecture notes, a reading, or anything you need to understand…"
                placeholderTextColor={colors.fgSubtle}
                multiline
                textAlignVertical="top"
                style={styles.textArea}
                testID="content-input"
              />
              {/* Counted on the student's text only, never on a wrapper label. */}
              <Text style={styles.counter}>
                {trimmedLength === 0
                  ? `At least ${MIN_CONTENT} characters`
                  : `${trimmedLength} characters${trimmedLength < MIN_CONTENT ? ` — ${MIN_CONTENT - trimmedLength} more needed` : ""}`}
              </Text>

              {!!error && (
                <View style={styles.error} accessibilityLiveRegion="polite">
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}

              <Button
                label="Generate study guide"
                onPress={submit}
                disabled={!canSubmit}
                loading={summarize.isPending}
                testID="summarize-button"
              />

              {summarize.isPending && (
                <Text style={styles.pendingNote}>
                  This can take up to a minute for long notes — longer if the
                  server has gone to sleep.
                </Text>
              )}

              {!!result && (
                <>
                  <Text style={styles.sectionTitle}>Your study guide</Text>
                  <Card>
                    {/*
                      Rendered as selectable plain text. The web client converts
                      markdown; doing that here would mean shipping a markdown
                      parser before the feature has even been reviewed on a
                      phone. Markdown rendering is a known follow-up.
                    */}
                    <Text selectable style={styles.resultText}>
                      {result}
                    </Text>
                  </Card>
                </>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* POPIA consent sheet. Appears once, and never blocks the feature. */}
      <Modal
        visible={showConsent}
        animationType="fade"
        transparent
        onRequestClose={() => setShowConsent(false)}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Help improve Varsity Companion?</Text>
            <Text style={styles.sheetBody}>
              We would like to record which features you use, so we can tell what is
              working and what is not. This is usage data only — never the text of
              your notes, your summaries, or anything you upload.
            </Text>
            <Text style={styles.sheetBody}>
              You can change this any time in Settings, and saying no will not limit
              any feature.
            </Text>

            <View style={styles.sheetActions}>
              <Button
                label="Not now"
                variant="ghost"
                testID="consent-decline"
                onPress={() => {
                  declinedThisSession.current = true;
                  setShowConsent(false);
                  // The summary still runs. Declining telemetry must never cost
                  // the student the feature itself.
                  void runSummary();
                }}
              />
              <Button
                label="Allow"
                testID="consent-allow"
                onPress={() => {
                  void (async () => {
                    try {
                      await consent.update(true, "onboarding");
                    } catch {
                      // A failed consent write must not block the summary.
                    }
                    setShowConsent(false);
                    void runSummary();
                  })();
                }}
              />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space.lg, paddingBottom: space.xxl },

  fieldLabel: {
    ...typography.label,
    color: colors.fgMuted,
    textTransform: "uppercase",
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  textArea: {
    minHeight: 180,
    backgroundColor: colors.sunk,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: space.md,
    color: colors.fg,
    ...typography.body,
  },
  counter: { ...typography.caption, color: colors.fgSubtle, marginTop: space.xs },
  muted: { ...typography.caption, color: colors.fgMuted },
  pendingNote: {
    ...typography.caption,
    color: colors.fgMuted,
    textAlign: "center",
    marginTop: space.md,
  },
  sectionTitle: {
    ...typography.title,
    color: colors.fg,
    marginTop: space.xl,
    marginBottom: space.md,
  },
  resultText: { ...typography.body, color: colors.fg },

  error: {
    backgroundColor: "rgba(232,92,106,0.12)",
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.sm,
    padding: space.md,
    marginVertical: space.md,
  },
  errorText: { ...typography.caption, color: colors.danger },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    alignItems: "center",
    justifyContent: "center",
    padding: space.lg,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.xl,
    maxWidth: 420,
  },
  sheetTitle: { ...typography.title, color: colors.fg, marginBottom: space.md },
  sheetBody: {
    ...typography.body,
    color: colors.fgMuted,
    marginBottom: space.md,
  },
  sheetActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: space.md,
    marginTop: space.sm,
  },
});
