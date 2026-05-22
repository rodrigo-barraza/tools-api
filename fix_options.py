import os, re

def process_file(path, options_interface, target_func_pattern):
    if not os.path.exists(path): return
    with open(path, 'r') as f:
        content = f.read()

    # Add interface if not exists
    interface_name = options_interface.split(' ')[2]
    if interface_name not in content:
        # Find imports
        import_end = content.rfind('import ')
        if import_end != -1:
            next_newline = content.find('\n', import_end)
            content = content[:next_newline+1] + '\n' + options_interface + '\n' + content[next_newline+1:]

    # Replace parameter type
    content = re.sub(
        target_func_pattern + r'\s*:\s*Record<string,\s*unknown>\s*=\s*\{\}',
        r': ' + interface_name + ' = {}',
        content
    )

    with open(path, 'w') as f:
        f.write(content)

# WebcamFetcher
process_file(
    'src/fetchers/utility/WebcamFetcher.ts',
    'export interface WebcamOptions { city?: string; limit?: number; }',
    r'(\{ city = "vancouver", limit = 100 \}'
)

with open('src/fetchers/utility/WebcamFetcher.ts', 'r') as f:
    c = f.read()
    c = c.replace('WEBCAM_REGISTRY[normalizedCity]', 'WEBCAM_REGISTRY[normalizedCity as keyof typeof WEBCAM_REGISTRY]')
with open('src/fetchers/utility/WebcamFetcher.ts', 'w') as f: f.write(c)

# GenericPageFetcher
process_file(
    'src/fetchers/web/GenericPageFetcher.ts',
    'export interface GenericPageOptions { maxChars?: number | string; }',
    r'(options'
)
with open('src/fetchers/web/GenericPageFetcher.ts', 'r') as f:
    c = f.read()
    c = c.replace('parseInt(options.maxChars, 10)', 'parseInt(String(options.maxChars), 10)')
with open('src/fetchers/web/GenericPageFetcher.ts', 'w') as f: f.write(c)

# PdfFetcher
process_file(
    'src/fetchers/web/PdfFetcher.ts',
    'export interface PdfOptions { maxPages?: number | string; maxChars?: number | string; }',
    r'(options'
)
with open('src/fetchers/web/PdfFetcher.ts', 'r') as f:
    c = f.read()
    c = c.replace('parseInt(options.maxPages, 10)', 'parseInt(String(options.maxPages), 10)')
    c = c.replace('parseInt(options.maxChars, 10)', 'parseInt(String(options.maxChars), 10)')
with open('src/fetchers/web/PdfFetcher.ts', 'w') as f: f.write(c)

# RssFetcher
process_file(
    'src/fetchers/web/RssFetcher.ts',
    'export interface RssOptions { limit?: number; }',
    r'(options'
)
with open('src/fetchers/web/RssFetcher.ts', 'r') as f:
    c = f.read()
    c = c.replace('options.limit || 50', 'options.limit ?? 50')
    c = c.replace('options.limit || 20', 'options.limit ?? 20')
with open('src/fetchers/web/RssFetcher.ts', 'w') as f: f.write(c)

# StackOverflowFetcher
process_file(
    'src/fetchers/web/StackOverflowFetcher.ts',
    'export interface StackOverflowOptions { limit?: number; maxChars?: number; }',
    r'(options'
)
with open('src/fetchers/web/StackOverflowFetcher.ts', 'r') as f:
    c = f.read()
    c = c.replace('options.limit || 10', 'options.limit ?? 10')
    c = c.replace('options.maxChars || 4000', 'options.maxChars ?? 4000')
    c = c.replace('result.answers.slice', '((result.answers as any[]) || []).slice')
with open('src/fetchers/web/StackOverflowFetcher.ts', 'w') as f: f.write(c)

# WaybackFetcher
process_file(
    'src/fetchers/web/WaybackFetcher.ts',
    'export interface WaybackOptions { limit?: number; }',
    r'(options'
)
with open('src/fetchers/web/WaybackFetcher.ts', 'r') as f:
    c = f.read()
    c = c.replace('options.limit || 10', 'options.limit ?? 10')
with open('src/fetchers/web/WaybackFetcher.ts', 'w') as f: f.write(c)

# WebContentFetcher
process_file(
    'src/fetchers/web/WebContentFetcher.ts',
    'export interface WebContentOptions { maxChars?: number; format?: string; }',
    r'(options'
)
with open('src/fetchers/web/WebContentFetcher.ts', 'r') as f:
    c = f.read()
    c = c.replace('options.maxChars || 8000', 'options.maxChars ?? 8000')
    c = c.replace('options.format ||', 'options.format ??')
with open('src/fetchers/web/WebContentFetcher.ts', 'w') as f: f.write(c)

