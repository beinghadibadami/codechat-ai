"""
Regression tests for answer-grounding failures.

These exist because of two real bugs found in live sessions:

  1. Asked for a portfolio site's tech stack, the model answered with MongoDB,
     Socket.io, AWS S3, Clerk, Shopify, Razorpay and Shiprocket. None of those
     were dependencies — they were strings inside a projects-showcase array
     describing *other* projects the site displayed. Two causes: `package.json`
     was excluded from indexing, so there was no authoritative source; and
     nothing marked the showcase chunk as data rather than implementation.

  2. Citations rendered as `[AllProjects.tsx:1.0-18.0]`. Pinecone stores
     metadata numbers as doubles, so line numbers came back as floats, and the
     frontend citation regex rejected them — silently turning every citation
     into plain text.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import env_loader  # noqa: F401


# The exact pattern the frontend uses (frontend/src/lib/citations.ts).
# Kept in sync by hand; if it changes there, change it here.
CITATION_RE = re.compile(r'\[((?:[\w./-]+)\.\w{1,6})(?::(\d+)(?:-(\d+))?)?\]')


# --------------------------------------------------------------------------
# 1. Dependency manifests must be indexed
# --------------------------------------------------------------------------

def test_manifests_are_indexed():
    """
    A manifest is the only authoritative answer to "what is this built with".
    Excluding them is what forced the model to guess from string literals.
    """
    from document_loader import _is_manifest

    for name in [
        'package.json', 'requirements.txt', 'pyproject.toml', 'Pipfile',
        'go.mod', 'Cargo.toml', 'composer.json', 'Gemfile', 'pom.xml',
        'build.gradle', 'Dockerfile', 'pubspec.yaml', 'App.csproj',
    ]:
        assert _is_manifest(name), f'{name} should be treated as a manifest'
    print('[PASS] dependency manifests are recognised')


def test_manifest_beats_every_skip_rule():
    """
    package.json used to sit in SKIP_FILES. Manifests must now win over the
    name list, the generated-file patterns and the extension allow-list.
    """
    from document_loader import (
        _is_manifest, SKIP_FILES, _matches_skip_pattern, SUPPORTED_EXTENSIONS,
    )

    # Dockerfile has no extension at all, yet must still be indexed
    assert _is_manifest('Dockerfile')
    assert os.path.splitext('Dockerfile')[1] not in SUPPORTED_EXTENSIONS

    # No manifest may be sitting in the skip list any more
    for name in ('package.json', 'pyproject.toml', 'requirements.txt', 'Dockerfile'):
        assert name not in SKIP_FILES, f'{name} must not be skipped'
        assert not _matches_skip_pattern(name), f'{name} must not match a skip pattern'
    print('[PASS] manifests bypass the skip rules')


def test_lockfiles_still_excluded():
    """Lockfiles are huge and redundant with the manifest — keep them out."""
    from document_loader import SKIP_FILES, _is_manifest

    for name in [
        'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb',
        'Cargo.lock', 'poetry.lock', 'go.sum', 'Gemfile.lock', 'composer.lock',
    ]:
        assert name in SKIP_FILES, f'{name} should be skipped'
        assert not _is_manifest(name), f'{name} is a lockfile, not a manifest'
    print('[PASS] lockfiles remain excluded')


# --------------------------------------------------------------------------
# 2. Content data must be distinguishable from implementation
# --------------------------------------------------------------------------

SHOWCASE_ARRAY = '''
const projects = [
  {
    title: "ShopFlow",
    description: "A commerce storefront with cart and checkout",
    tech: ["Next.js", "MongoDB", "Razorpay", "Shiprocket"],
    link: "https://example.com/shopflow",
  },
  {
    title: "ChatRoom",
    description: "Realtime messaging with presence",
    tech: ["Socket.io", "AWS S3", "Clerk"],
    link: "https://example.com/chatroom",
  },
  {
    title: "ImageGen",
    description: "On the fly AI image generation",
    tech: ["Runware", "Node.js"],
    link: "https://example.com/imagegen",
  },
];
'''

REAL_COMPONENT = '''
export function ProjectCard({ project, onOpen }) {
  const [expanded, setExpanded] = useState(false);

  if (!project) {
    return null;
  }

  const handleClick = async () => {
    await track("project_open", project.id);
    setExpanded(true);
    onOpen?.(project);
  };

  return <article onClick={handleClick}>{project.title}</article>;
}
'''

IMPORT_BLOCK = '''
import React, { useState } from "react";
import { Github, ExternalLink } from "lucide-react";
import { Magnetic } from "@/components/Magnetic";
'''


def _manager():
    """An EnhancedPineconeManager without touching the network."""
    from embed_store_v2 import EnhancedPineconeManager
    return EnhancedPineconeManager.__new__(EnhancedPineconeManager)


def test_showcase_array_flagged_as_content_data():
    """
    The exact shape that caused the wrong answer must be flagged, so the prompt
    can tell the model these strings are displayed content, not dependencies.
    """
    pm = _manager()
    kind = pm._classify_chunk_type(SHOWCASE_ARRAY)
    assert kind == 'content_data', f'got {kind!r}'
    print('[PASS] projects-showcase array classified as content_data')


def test_real_code_not_flagged_as_content_data():
    """Implementation must not be mislabelled — that would suppress real evidence."""
    pm = _manager()
    for label, text in [('component', REAL_COMPONENT), ('imports', IMPORT_BLOCK)]:
        kind = pm._classify_chunk_type(text)
        assert kind != 'content_data', f'{label} wrongly flagged as content_data'
    print('[PASS] implementation and imports are not flagged as content_data')


def test_chunk_kind_reaches_the_prompt():
    """
    Classification is useless if the model never sees it. The context header
    must carry kind= so the prompt rule has something to act on.
    """
    from services.llm_service import build_chat_context

    chunks = [
        {
            'text': SHOWCASE_ARRAY,
            'file_name': 'AllProjects.tsx',
            'file_path': 'src/AllProjects.tsx',
            'language': 'typescript',
            'line_start': 50,
            'line_end': 65,
            'chunk_type': 'content_data',
            'score': 0.77,
        },
    ]
    prompt, _ = build_chat_context(chunks, 'what tech stack does this use?')

    assert 'kind=content_data' in prompt, prompt[:400]
    print('[PASS] chunk kind is exposed in the prompt context')


def test_prompt_ranks_manifests_over_string_literals():
    """The system prompt must encode the evidence hierarchy explicitly."""
    from query_llm import sys_prompt

    lowered = sys_prompt.lower()
    assert 'content_data' in lowered
    assert 'package.json' in lowered
    assert 'displays' in lowered
    # The rule has to say string literals are NOT evidence
    assert 'not evidence' in lowered
    print('[PASS] system prompt encodes the USES vs DISPLAYS hierarchy')


# --------------------------------------------------------------------------
# 3. Line numbers must survive the Pinecone round trip as integers
# --------------------------------------------------------------------------

def test_line_numbers_coerced_from_float():
    """
    Pinecone returns metadata numbers as doubles. Left as floats they render
    "file.tsx:1.0-18.0", which the frontend citation regex rejects.
    """
    from embed_store_v2 import _as_line_no

    assert _as_line_no(18.0) == 18
    assert _as_line_no('18.0') == 18
    assert _as_line_no(18) == 18
    # Unusable values become None rather than 0 or a crash
    assert _as_line_no(None) is None
    assert _as_line_no(0) is None
    assert _as_line_no(0.0) is None
    assert _as_line_no('abc') is None
    print('[PASS] line numbers coerced to int, junk becomes None')


def test_citation_from_float_metadata_is_parseable():
    """
    End-to-end guard on the actual bug: build a context from float line numbers
    and confirm the resulting cite_as survives the frontend regex.
    """
    from embed_store_v2 import _as_line_no
    from services.llm_service import build_chat_context

    # Simulate what Pinecone hands back
    raw = {'line_start': 1.0, 'line_end': 18.0}

    chunks = [{
        'text': 'import React from "react";',
        'file_name': 'AllProjects.tsx',
        'file_path': 'src/AllProjects.tsx',
        'language': 'typescript',
        'line_start': _as_line_no(raw['line_start']),
        'line_end': _as_line_no(raw['line_end']),
        'chunk_type': 'imports',
        'score': 0.9,
    }]
    prompt, _ = build_chat_context(chunks, 'what does this import?')

    assert 'cite_as=AllProjects.tsx:1-18' in prompt, prompt[:400]
    assert '1.0' not in prompt, 'float leaked into the citation hint'

    # And the frontend must be able to parse a citation built from it
    m = CITATION_RE.search('[AllProjects.tsx:1-18]')
    assert m and m.groups() == ('AllProjects.tsx', '1', '18')
    print('[PASS] float metadata yields a frontend-parseable citation')


def test_frontend_regex_rejects_float_citations():
    """
    Documents why the coercion matters: the float form genuinely does not parse,
    so without _as_line_no every citation degrades to plain text.
    """
    assert CITATION_RE.search('[AllProjects.tsx:1.0-18.0]') is None
    assert CITATION_RE.search('[index.html:327.0-341.0]') is None
    assert CITATION_RE.search('[AllProjects.tsx:1-18]') is not None
    print('[PASS] confirmed float citations are unparseable (the original bug)')


# --------------------------------------------------------------------------
# 4. Mermaid diagram rendering
# --------------------------------------------------------------------------

_FRONTEND_SRC = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
    'frontend', 'src',
)


def _frontend(*parts: str) -> str:
    path = os.path.join(_FRONTEND_SRC, *parts)
    assert os.path.exists(path), f'expected frontend file missing: {path}'
    with open(path, encoding='utf-8') as fh:
        return fh.read()


def test_prompt_forbids_diagram_theming_directives():
    """
    A model-emitted `classDef comp fill:#1e1e2e,...` line ended up alone in its
    own mermaid fence. On its own it is not a valid diagram, and the hard-coded
    dark colours fight the light theme anyway. The prompt must rule them out.
    """
    from query_llm import sys_prompt

    lowered = sys_prompt.lower()
    for directive in ('classdef', 'linkstyle'):
        assert directive in lowered, f'prompt should mention {directive} to forbid it'

    assert 'one' in lowered and 'fence' in lowered, 'prompt should require a single fence'
    assert 'never use' in lowered, 'prompt should state the prohibition plainly'
    print('[PASS] prompt forbids classDef/style and multi-fence diagrams')


def test_mermaid_error_rendering_is_suppressed():
    """
    The root cause of "Syntax error in text" blocks appearing outside the chat
    container: on a failed render Mermaid draws its own error graphic into a
    temp node appended to <body> and leaves it there. suppressErrorRendering
    makes it clean up and rethrow instead.
    """
    src = _frontend('lib', 'mermaid.ts')
    assert 'suppressErrorRendering: true' in src, 'error rendering must stay suppressed'

    # Every initialize() call has to go through the shared config, otherwise one
    # of them silently loses the flag — which is how this regressed before.
    assert src.count('mermaid.initialize(baseConfig())') == 2, (
        'both loadMermaid and resetMermaidTheme must initialize via baseConfig'
    )
    # Set in exactly one place, so it can't be lost from one code path only.
    assert src.count('suppressErrorRendering: true') == 1, (
        'the flag should be set in exactly one place (baseConfig)'
    )
    print('[PASS] mermaid error rendering suppressed via a single shared config')


def test_diagram_render_waits_for_stream_to_finish():
    """
    While streaming, `chart` is a partial fence on every token. Rendering each
    one is both wasted work and the thing that produced a pile of error
    graphics. The block must take a streaming flag and bail out early.
    """
    block = _frontend('components', 'MermaidBlock.tsx')
    assert 'streaming' in block, 'MermaidBlock must accept a streaming flag'
    assert 'if (streaming)' in block, 'MermaidBlock must short-circuit while streaming'

    # parse() validates without touching the DOM; render() must not be the first
    # thing a possibly-invalid diagram hits.
    assert 'mermaid.parse(' in block, 'validate with parse() before render()'
    assert block.index('mermaid.parse(') < block.index('mermaid.render('), (
        'parse() must run before render()'
    )

    # And the flag has to actually be wired from the message row down.
    row = _frontend('components', 'chat', 'MessageRow.tsx')
    formatter = _frontend('components', 'MessageFormatter.tsx')
    assert 'streaming={streaming}' in row, 'MessageRow must pass streaming to the formatter'
    assert 'streaming={streaming}' in formatter, 'formatter must pass streaming to MermaidBlock'
    print('[PASS] diagrams defer rendering until the stream settles')


def test_fragment_fence_is_not_reported_as_a_broken_diagram():
    """
    A mermaid fence holding only `classDef ...` is a fragment, not a failed
    diagram. It should render as code, not as an error, so classDef must not be
    treated as a diagram-opening keyword.
    """
    src = _frontend('lib', 'mermaid.ts')
    assert 'looksLikeDiagram' in src and 'DIAGRAM_KEYWORDS' in src

    keywords_block = src[src.index('DIAGRAM_KEYWORDS'):src.index('looksLikeDiagram')]
    for fragment in ('classDef', 'linkStyle', 'style', 'class'):
        assert f"'{fragment}'" not in keywords_block, (
            f'{fragment} must not count as a diagram declaration'
        )
    for real in ('flowchart', 'sequenceDiagram', 'graph'):
        assert f"'{real}'" in keywords_block, f'{real} should be a recognised diagram type'

    block = _frontend('components', 'MermaidBlock.tsx')
    assert 'not-a-diagram' in block, 'fragments need a distinct, non-alarming state'
    assert 'looksLikeDiagram(source)' in block, 'MermaidBlock must gate on looksLikeDiagram'
    print('[PASS] fragment fences render as code, not as failures')


# --------------------------------------------------------------------------

TESTS = [
    test_manifests_are_indexed,
    test_manifest_beats_every_skip_rule,
    test_lockfiles_still_excluded,
    test_showcase_array_flagged_as_content_data,
    test_real_code_not_flagged_as_content_data,
    test_chunk_kind_reaches_the_prompt,
    test_prompt_ranks_manifests_over_string_literals,
    test_line_numbers_coerced_from_float,
    test_citation_from_float_metadata_is_parseable,
    test_frontend_regex_rejects_float_citations,
    test_prompt_forbids_diagram_theming_directives,
    test_mermaid_error_rendering_is_suppressed,
    test_diagram_render_waits_for_stream_to_finish,
    test_fragment_fence_is_not_reported_as_a_broken_diagram,
]


if __name__ == '__main__':
    print(f'\nRunning {len(TESTS)} grounding tests...\n')
    passed, failed = 0, []
    for t in TESTS:
        try:
            t()
            passed += 1
        except AssertionError as e:
            print(f'[FAIL] {t.__name__}: {e}')
            failed.append(t.__name__)
        except Exception as e:
            print(f'[ERROR] {t.__name__}: {type(e).__name__}: {e}')
            failed.append(t.__name__)

    print(f'\n{passed}/{len(TESTS)} passed')
    if failed:
        print(f'Failed: {failed}')
        sys.exit(1)
    print('\nAll grounding tests passed.')
