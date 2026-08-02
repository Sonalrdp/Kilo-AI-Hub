import urllib.request
import json

def test():
    try:
        url = 'https://god-maog.onrender.com/openai/v1/models'
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as response:
            status = response.getcode()
            print('Status:', status)
            data = json.loads(response.read().decode())
            print('Data:', json.dumps(data, indent=2))
    except Exception as e:
        print('Error:', e)

if __name__ == '__main__':
    test()
