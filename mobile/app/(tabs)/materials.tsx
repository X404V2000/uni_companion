/**
 * app/(tabs)/materials.tsx — Find Materials.
 *
 * THE BUG THIS SCREEN IS BUILT TO AVOID
 * -------------------------------------
 * The web version of this screen reported "No materials found" for days. Two
 * separate causes, both of which looked identical to the user:
 *
 *   1. The search fired on every keystroke, so typing "debug" issued six
 *      searches and the empty results for "d", "de", "deb" were what the user
 *      saw as the final state.
 *   2. A search with no module selected returned a valid, empty result - which
 *      rendered as "no materials" rather than "pick a module".
 *
 * So here: search runs on submit, never as the query changes; and the empty
 * state distinguishes "no module selected" from "nothing matched" from "this
 * module has no resources yet". Three different situations, three different
 * messages, because a single message for all three is what made the original
 * bug so hard to diagnose.
 */
import { useState } from "react";
import {
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Button, Card, EmptyState, ScreenHeader } from "../../src/components/ui";
import { StaleBanner } from "../../src/components/StaleBanner";
import { describeError, isStaleAfterFailure, useMaterialSearch, useModules } from "../../src/lib/queries";
import { colors, moduleColor, radius, space, type as typography } from "../../src/theme";

/** Material types the backend can return, with a label for the filter chip. */
const TYPE_FILTERS = [
  { value: "", label: "All" },
  { value: "YOUTUBE", label: "Video" },
  { value: "JOURNAL", label: "Journal" },
  { value: "ARTICLE", label: "Article" },
  { value: "PDF", label: "PDF" },
] as const;

export default function MaterialsScreen() {
  const insets = useSafeAreaInsets();

  const modules = useModules();

  const [moduleCode, setModuleCode] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  /**
   * The submitted query, distinct from what is in the box.
   *
   * This separation is the fix for the keystroke bug: typing updates `draft`,
   * and only pressing Search or Enter updates `query` and triggers a request.
   */
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");

  const moduleList = modules.data ?? [];
  const effectiveModule = moduleCode || moduleList[0]?.code || "";

  const search = useMaterialSearch(effectiveModule, query);

  /**
   * The backend returns a page; the type filter is applied here.
   *
   * Filtering client-side keeps one request per search rather than one per chip
   * tap, which matters when a request is the expensive thing.
   */
  const allItems = search.data?.items ?? [];
  const items = typeFilter
    ? allItems.filter((m) => (m.resource_type ?? "").toUpperCase() === typeFilter)
    : allItems;

  const total = search.data?.total ?? 0;

  function runSearch() {
    setQuery(draft.trim());
  }

  /** The empty state must say which of the three situations applies. */
  function emptyReason(): { title: string; hint: string } {
    if (!effectiveModule) {
      return {
        title: "Pick a module first",
        hint: "Resources are organised per module. Add one in Settings to get started.",
      };
    }
    if (query) {
      return {
        title: `Nothing matched “${query}”`,
        hint: "That may simply mean no resource covers it yet. Try a broader word, or browse the module without a search term.",
      };
    }
    return {
      title: "No resources for this module yet",
      hint: "This module has not been populated. Try another module, or browse a module with an established library.",
    };
  }

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={search.isRefetching}
            onRefresh={() => void search.refetch()}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {isStaleAfterFailure(modules) ? (
          <StaleBanner
            onRetry={() => void modules.refetch()}
            dataUpdatedAt={modules.dataUpdatedAt}
          />
        ) : null}

        <ScreenHeader
          title="Find Materials"
          subtitle="Curated resources for your modules"
        />

        {moduleList.length === 0 ? (
          <Card>
            <EmptyState
              title="No modules yet"
              hint="Add a module in Settings, then its resources will appear here."
            />
          </Card>
        ) : (
          <>
            {/* Module picker */}
            <Text style={styles.fieldLabel}>Module</Text>
            <View style={styles.chips}>
              {moduleList.map((m) => {
                const active = effectiveModule === m.code;
                const tint = moduleColor(m.code);
                return (
                  <View
                    key={m.id}
                    style={[
                      styles.chip,
                      active && { borderColor: tint.fg, backgroundColor: tint.bg },
                    ]}
                  >
                    <Button
                      label={m.code}
                      variant={active ? "primary" : "ghost"}
                      onPress={() => setModuleCode(m.code)}
                    />
                  </View>
                );
              })}
            </View>

            {/* Search. Explicit submit, never per keystroke. */}
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <Text style={styles.searchGlyph}>⌕</Text>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  onSubmitEditing={runSearch}
                  placeholder="Search by topic or keyword"
                  placeholderTextColor={colors.fgSubtle}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="search"
                  style={styles.searchInput}
                  testID="materials-search-input"
                />
              </View>
              <Button label="Search" onPress={runSearch} testID="materials-search-button" />
            </View>

            {/* Type filters */}
            <View style={styles.chips}>
              {TYPE_FILTERS.map((f) => (
                <Button
                  key={f.value || "all"}
                  label={f.label}
                  variant={typeFilter === f.value ? "primary" : "secondary"}
                  onPress={() => setTypeFilter(f.value)}
                />
              ))}
            </View>

            {/* Result meta. Always shown, so "0 results" is never ambiguous. */}
            {!search.isLoading && (
              <Text style={styles.meta}>
                {query
                  ? `${total} result${total === 1 ? "" : "s"} for “${query}”`
                  : `${total} resource${total === 1 ? "" : "s"} for ${effectiveModule}`}
              </Text>
            )}

            {search.isLoading ? (
              <Card>
                <Text style={styles.muted}>Searching…</Text>
              </Card>
            ) : search.isError ? (
              <Card>
                <EmptyState
                  title="Search failed"
                  hint={describeError(search.error)}
                  action={<Button label="Retry" onPress={() => void search.refetch()} />}
                />
              </Card>
            ) : items.length === 0 ? (
              <Card>
                <EmptyState
                  {...emptyReason()}
                  action={
                    (query || typeFilter) && (
                      <Button
                        label="Show everything for this module"
                        variant="secondary"
                        onPress={() => {
                          setDraft("");
                          setQuery("");
                          setTypeFilter("");
                        }}
                      />
                    )
                  }
                />
              </Card>
            ) : (
              items.map((m) => {
                const tint = moduleColor(m.module_code ?? effectiveModule);
                return (
                  <Card key={m.id}>
                    <Text style={styles.itemTitle}>{m.title}</Text>
                    <View style={styles.itemMetaRow}>
                      <Text style={[styles.badge, { color: tint.fg, borderColor: tint.fg }]}>
                        {m.resource_type.toUpperCase()}
                      </Text>
                      {/* There is no `source` field on StudyMaterial. The
                          description is the closest real field, so it is what
                          gets shown rather than an invented one. */}
                      {!!m.description && (
                        <Text style={styles.itemMeta} numberOfLines={2}>
                          {m.description}
                        </Text>
                      )}
                    </View>
                    {!!m.url && (
                      <Button
                        label="Open resource"
                        variant="secondary"
                        onPress={() => {
                          // Opened in the system browser rather than a webview.
                          // A webview would hide the address bar, and students
                          // should always be able to see where a link goes.
                          void Linking.openURL(m.url!).catch(() => {
                            /* An unopenable link must not crash the screen. */
                          });
                        }}
                      />
                    )}
                  </Card>
                );
              })
            )}
          </>
        )}
      </ScrollView>
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
    marginBottom: space.sm,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md },
  chip: { borderRadius: radius.sm, borderWidth: 1, borderColor: "transparent" },

  searchRow: { flexDirection: "row", gap: space.sm, marginBottom: space.md },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.sunk,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    minHeight: 44,
    gap: space.sm,
  },
  searchGlyph: { color: colors.fgSubtle, fontSize: 18 },
  searchInput: { flex: 1, color: colors.fg, ...typography.body, paddingVertical: space.sm },

  meta: { ...typography.caption, color: colors.fgSubtle, marginBottom: space.md },
  muted: { ...typography.caption, color: colors.fgMuted },

  itemTitle: { ...typography.bodyStrong, color: colors.fg, marginBottom: space.sm },
  itemMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginBottom: space.md,
  },
  badge: {
    ...typography.label,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
  },
  itemMeta: { ...typography.caption, color: colors.fgMuted, flex: 1 },
});
