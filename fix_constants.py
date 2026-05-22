import re

with open('src/constants.ts', 'r') as f:
    content = f.read()

content = content.replace('PRODUCT_SOURCES = {', 'PRODUCT_SOURCES: Record<string, string> = {')
content = content.replace('PRODUCT_CATEGORIES = {', 'PRODUCT_CATEGORIES: Record<string, string> = {')
content = content.replace('TREND_SOURCES = {', 'TREND_SOURCES: Record<string, string> = {')
content = content.replace('TREND_CATEGORIES = {', 'TREND_CATEGORIES: Record<string, string> = {')
content = content.replace('WEATHER_SOURCES = {', 'WEATHER_SOURCES: Record<string, string> = {')
content = content.replace('HEALTH_SOURCES = {', 'HEALTH_SOURCES: Record<string, string> = {')

with open('src/constants.ts', 'w') as f:
    f.write(content)

