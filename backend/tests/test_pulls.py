"""
Tests for pull-request support and the session source metadata added for the
revamped UI.

Network calls to GitHub are mocked — these verify our parsing, context
assembly and route guards, not GitHub's API.
"""
import sys
import os
from unittest.mock import patch, AsyncMock

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import env_loader  # noqa: F401
from fastapi.testclient import TestClient  # noqa: E402
from main import app  # noqa: E402

client = TestClient(app)


# ------- URL / reference parsing -----------------------------------------

def test_parse_repo_url_variants():
    from services.github_api import parse_repo_url

    cases = {
        'https://github.com/pypa/sampleproject': ('pypa', 'sampleproject'),
        'https://github.com/pypa/sampleproject/': ('pypa', 'sampleproject'),
        'https://github.com/pypa/sampleproject.git': ('pypa', 'sampleproject'),
        'https://github.com/pypa/sampleproject/tree/main': ('pypa', 'sampleproject'),
        'https://www.github.com/a-b/c.d': ('a-b', 'c.d'),
    }
    for url, expected in cases.items():
        assert parse_repo_url(url) == expected, f'{url} -> {parse_repo_url(url)}'

    assert parse_repo_url('https://gitlab.com/a/b') is None
    assert parse_repo_url('not a url') is None
    print(f'[PASS] parse_repo_url handles {len(cases)} variants + rejects non-GitHub')


def test_parse_pr_url():
    from services.github_api import parse_pr_url

    assert parse_pr_url('https://github.com/foo/bar/pull/412') == ('foo', 'bar', 412)
    assert parse_pr_url('https://github.com/foo/bar/pull/412/files') == ('foo', 'bar', 412)
    assert parse_pr_url('https://github.com/foo/bar') is None
    print('[PASS] parse_pr_url')


def test_extract_pr_reference():
    from services.github_api import extract_pr_reference

    positives = {
        'what changed in #412?': 412,
        'explain PR 88': 88,
        'review PR#7': 7,
        'summarise pull request 1234': 1234,
        'look at pull/55': 55,
    }
    for text, expected in positives.items():
        assert extract_pr_reference(text) == expected, f'{text!r} -> {extract_pr_reference(text)}'

    # Should not fire on ordinary prose containing numbers
    for text in ['refactor the 3 helpers', 'bump to version 2', 'what does main.py do']:
        assert extract_pr_reference(text) is None, f'false positive on {text!r}'

    print(f'[PASS] extract_pr_reference: {len(positives)} hits, 3 non-matches')


def test_repo_display_name():
    from services.github_api import repo_display_name

    assert repo_display_name('https://github.com/pypa/sampleproject') == 'pypa/sampleproject'
    assert repo_display_name('nonsense') is None
    print('[PASS] repo_display_name')


# ------- Diff context assembly -------------------------------------------

def _fake_pr(num_files=2, patch_size=50):
    return {
        'number': 412,
        'title': 'Add idempotency key to charges',
        'body': 'Prevents duplicate charges on retry.',
        'state': 'open',
        'author': 'octocat',
        'head': 'fix/idempotency',
        'base': 'main',
        'additions': 12,
        'deletions': 3,
        'changed_files': num_files,
        'url': 'https://github.com/foo/bar/pull/412',
        'files': [
            {
                'filename': f'src/file_{i}.ts',
                'status': 'modified',
                'additions': 6,
                'deletions': 1,
                'changes': 7,
                'patch': '@@ -1,3 +1,4 @@\n-old line\n+new line\n' + ('x' * patch_size),
                'patch_omitted': False,
            }
            for i in range(num_files)
        ],
        'comments': [
            {'author': 'reviewer', 'body': 'This prevents duplicate charges on retry.',
             'path': 'src/file_0.ts', 'line': 14, 'created_at': None},
        ],
    }


def test_build_diff_context_includes_essentials():
    from services.github_api import build_diff_context

    text = build_diff_context(_fake_pr())
    assert 'PULL REQUEST #412' in text
    assert 'Add idempotency key' in text
    assert 'src/file_0.ts' in text
    assert '+new line' in text
    assert 'REVIEW COMMENTS' in text
    assert 'reviewer' in text
    print('[PASS] build_diff_context includes title, files, patch and comments')


def test_build_diff_context_respects_budget():
    from services.github_api import build_diff_context

    # Many large files against a tiny budget
    pr = _fake_pr(num_files=20, patch_size=2000)
    text = build_diff_context(pr, max_chars=3000)
    assert 'truncated' in text.lower()
    # Budget is a soft cap (the header is always emitted) but must stay bounded
    assert len(text) < 8000, f'context grew to {len(text)} chars'
    print(f'[PASS] build_diff_context truncates: {len(text)} chars under a 3000 budget')


# ------- Route guards -----------------------------------------------------

def test_pulls_requires_repo():
    """With no GitHub repo in session, /pulls explains what's needed."""
    client.post('/reset-session')
    r = client.get('/pulls')
    assert r.status_code == 400
    detail = r.json()['detail'].lower()
    assert 'repository' in detail
    print('[PASS] /pulls returns 400 with an actionable message when no repo')


def test_pull_detail_requires_repo():
    client.post('/reset-session')
    r = client.get('/pulls/1')
    assert r.status_code == 400
    print('[PASS] /pulls/{n} guarded the same way')


def test_pulls_resolve_rejects_non_pr_url():
    r = client.post('/pulls/resolve', json={'url': 'https://github.com/foo/bar'})
    assert r.status_code == 400
    assert 'pull request' in r.json()['detail'].lower()
    print('[PASS] /pulls/resolve rejects a non-PR URL')


def test_pulls_resolve_accepts_pr_url():
    r = client.post('/pulls/resolve', json={'url': 'https://github.com/foo/bar/pull/99'})
    assert r.status_code == 200
    body = r.json()
    assert body['owner'] == 'foo' and body['repo'] == 'bar' and body['number'] == 99
    print('[PASS] /pulls/resolve parses owner/repo/number')


# ------- Session source metadata -----------------------------------------

def test_session_info_exposes_source_fields():
    """The revamped top bar reads these; they must always be present."""
    client.post('/reset-session')
    r = client.get('/session-info')
    assert r.status_code == 200
    body = r.json()
    for key in ('source_type', 'repo_url', 'repo_name', 'indexing', 'github_user'):
        assert key in body, f'missing {key}'
    # Fresh session
    assert body['source_type'] is None
    assert body['indexing'] is False
    print('[PASS] /session-info exposes source_type, repo_url, repo_name, indexing')


def test_session_service_tracks_source_metadata():
    from services import session_service

    session_service.reset_session()
    session_service.update_session(
        source_type='github',
        repo_url='https://github.com/foo/bar',
        repo_name='foo/bar',
        indexing=True,
    )
    s = session_service.get_session()
    assert s['source_type'] == 'github'
    assert s['repo_name'] == 'foo/bar'
    assert s['indexing'] is True

    session_service.update_session(indexing=False)
    assert session_service.get_session()['indexing'] is False
    print('[PASS] session_service stores and clears source metadata')


def test_reset_preserves_github_auth_but_clears_source():
    from services import session_service

    session_service.store_github_auth('gho_fake', 'octocat')
    session_service.update_session(source_type='github', repo_name='foo/bar')
    session_service.reset_session()

    s = session_service.get_session()
    assert s['github_token'] == 'gho_fake', 'auth should survive a reset'
    assert s['source_type'] is None, 'source metadata should be cleared'
    session_service.clear_github_auth()
    print('[PASS] reset keeps GitHub auth, clears the codebase')


# ------- PR-aware chat ----------------------------------------------------

def test_chat_attaches_pr_context_when_referenced():
    """
    A message containing "#412" on a GitHub-backed session should cause the
    diff to be fetched and surfaced in metadata.pull_request.
    """
    from services import session_service

    session_service.reset_session()
    session_service.update_session(
        source_type='github',
        repo_url='https://github.com/foo/bar',
        repo_name='foo/bar',
    )

    fake = _fake_pr()

    # has_data() must be True for the chat route to proceed
    with patch('routes.chat.session_service.has_data', return_value=True), \
         patch('routes.chat.fetch_pull_request', new=AsyncMock(return_value=fake)), \
         patch('routes.chat.get_pinecone_manager') as pm, \
         patch('routes.chat.query_llm', return_value='It adds an idempotency key.'):

        pm.return_value.smart_retrieve.return_value = []
        pm.return_value.query_analyzer.analyze_query.return_value = {'intent': 'general'}

        r = client.post('/chat', json={'message': 'what changed in #412?'})

    assert r.status_code == 200, r.text
    body = r.json()
    assert body['success'] is True
    assert 'pull_request' in body['metadata'], body['metadata']
    assert body['metadata']['pull_request']['number'] == 412
    print('[PASS] chat attaches PR diff context when the message references one')


def test_chat_ignores_pr_reference_without_repo():
    """On an upload-only session there's no remote, so no diff is fetched."""
    from services import session_service

    session_service.reset_session()
    session_service.update_session(source_type='upload', repo_name='3 local files')

    with patch('routes.chat.session_service.has_data', return_value=True), \
         patch('routes.chat.get_pinecone_manager') as pm, \
         patch('routes.chat.query_llm', return_value='answer'):

        pm.return_value.smart_retrieve.return_value = [
            {'text': 'code', 'file_name': 'a.py', 'file_path': 'a.py',
             'language': 'python', 'line_start': 1, 'line_end': 5, 'score': 0.9}
        ]
        pm.return_value.query_analyzer.analyze_query.return_value = {'intent': 'general'}

        r = client.post('/chat', json={'message': 'what about #412?'})

    assert r.status_code == 200
    assert 'pull_request' not in r.json()['metadata']
    print('[PASS] chat skips PR lookup when the session has no repo')


# ------- Runner -----------------------------------------------------------

TESTS = [
    test_parse_repo_url_variants,
    test_parse_pr_url,
    test_extract_pr_reference,
    test_repo_display_name,
    test_build_diff_context_includes_essentials,
    test_build_diff_context_respects_budget,
    test_pulls_requires_repo,
    test_pull_detail_requires_repo,
    test_pulls_resolve_rejects_non_pr_url,
    test_pulls_resolve_accepts_pr_url,
    test_session_info_exposes_source_fields,
    test_session_service_tracks_source_metadata,
    test_reset_preserves_github_auth_but_clears_source,
    test_chat_attaches_pr_context_when_referenced,
    test_chat_ignores_pr_reference_without_repo,
]


if __name__ == '__main__':
    print(f'\nRunning {len(TESTS)} pull-request / session tests...\n')
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
    print('\nAll pull-request tests passed.')
