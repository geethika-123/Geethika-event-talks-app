import os
import urllib.request
import xml.etree.ElementTree as ET
from flask import Flask, jsonify, render_template

app = Flask(__name__)

# Atom namespace
ATOM_NS = {'atom': 'http://www.w3.org/2005/Atom'}

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/releases')
def get_releases():
    url = "https://docs.cloud.google.com/feeds/bigquery-release-notes.xml"
    try:
        # Fetch the feed
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Antigravity/1.0'}
        )
        with urllib.request.urlopen(req) as response:
            xml_data = response.read()
        
        # Parse XML
        root = ET.fromstring(xml_data)
        
        entries = []
        for entry in root.findall('atom:entry', ATOM_NS):
            title = entry.find('atom:title', ATOM_NS)
            title_text = title.text if title is not None else ""
            
            id_elem = entry.find('atom:id', ATOM_NS)
            id_text = id_elem.text if id_elem is not None else ""
            
            updated = entry.find('atom:updated', ATOM_NS)
            updated_text = updated.text if updated is not None else ""
            
            link = entry.find('atom:link[@rel="alternate"]', ATOM_NS)
            if link is None:
                link = entry.find('atom:link', ATOM_NS)
            link_href = link.attrib.get('href', '') if link is not None else ""
            
            content = entry.find('atom:content', ATOM_NS)
            content_html = content.text if content is not None else ""
            
            entries.append({
                'title': title_text,
                'id': id_text,
                'updated': updated_text,
                'link': link_href,
                'content': content_html
            })
            
        return jsonify({
            'status': 'success',
            'feed_title': 'BigQuery Release Notes',
            'entries': entries
        })
    except Exception as e:
        return jsonify({
            'status': 'error',
            'message': str(e)
        }), 500

if __name__ == '__main__':
    # Default to port 8080 or standard Flask ports
    app.run(debug=True, host='0.0.0.0', port=5001)
