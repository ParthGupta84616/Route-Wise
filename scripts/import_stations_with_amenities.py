import csv
import requests
import time
from pymongo import MongoClient
from datetime import datetime
import os
from dotenv import load_dotenv
import random

# Load environment variables
load_dotenv()

# MongoDB connection
MONGO_URI = os.getenv('MONGO_URI', 'mongodb://localhost:27017/routewise')
client = MongoClient(MONGO_URI)
db = client['routewise']
collection = db['evstations']

# OpenStreetMap Overpass API
OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# Configurable retry settings
OVERPASS_TIMEOUT = int(os.getenv('OVERPASS_TIMEOUT', '60'))
OVERPASS_MAX_RETRIES = int(os.getenv('OVERPASS_MAX_RETRIES', '5'))
BACKOFF_BASE = float(os.getenv('OVERPASS_BACKOFF_BASE', '3'))
IMPORT_SLEEP_SECONDS = float(os.getenv('IMPORT_SLEEP_SECONDS', '5'))

def fetch_amenities_from_osm(lat, lng, radius_meters=2000):
    """
    Fetch ALL amenities near a location using OpenStreetMap Overpass API
    with retry logic for 429 and 504 errors
    Returns a list of ALL amenities with their types and distances
    """
    print(f"  Fetching amenities for ({lat}, {lng})...")
    
    query = f"""
    [out:json][timeout:55];
    (
        node["amenity"~"restaurant|cafe|fast_food|food_court|toilets|hospital|clinic|pharmacy|hotel|fuel|atm|bank|parking"](around:{radius_meters},{lat},{lng});
        way["amenity"~"restaurant|cafe|fast_food|food_court|toilets|hospital|clinic|pharmacy|hotel|fuel|atm|bank|parking"](around:{radius_meters},{lat},{lng});
    );
    out center tags;
    """
    
    attempt = 0
    while attempt < OVERPASS_MAX_RETRIES:
        attempt += 1
        try:
            response = requests.post(
                OVERPASS_URL,
                data=query,
                headers={'Content-Type': 'text/plain'},
                timeout=OVERPASS_TIMEOUT
            )
            
            if response.status_code == 200:
                data = response.json()
                amenities_with_distance = []
                
                if 'elements' not in data or len(data['elements']) == 0:
                    print(f"  ⚠️  No amenities found")
                    return []
                
                for element in data['elements']:
                    amenity_type = element.get('tags', {}).get('amenity')
                    name = element.get('tags', {}).get('name', 'Unknown')
                    
                    # Get coordinates (for nodes or center of ways)
                    if 'lat' in element and 'lon' in element:
                        amenity_lat = element['lat']
                        amenity_lng = element['lon']
                    elif 'center' in element:
                        amenity_lat = element['center']['lat']
                        amenity_lng = element['center']['lon']
                    else:
                        continue
                    
                    # Calculate distance
                    distance = calculate_distance(lat, lng, amenity_lat, amenity_lng)
                    
                    # Categorize amenity
                    category = categorize_amenity(amenity_type)
                    
                    if category and distance <= radius_meters:
                        amenities_with_distance.append({
                            'type': category,
                            'amenity': amenity_type,
                            'name': name,
                            'distance': round(distance, 2),
                            'lat': amenity_lat,
                            'lng': amenity_lng
                        })
                
                # Sort by distance
                amenities_with_distance.sort(key=lambda x: x['distance'])
                
                print(f"  ✅ Found {len(amenities_with_distance)} amenities")
                return amenities_with_distance
                
            elif response.status_code == 429:
                # Rate limited - use exponential backoff with jitter
                retry_after = response.headers.get('Retry-After')
                if retry_after:
                    try:
                        wait = float(retry_after)
                    except ValueError:
                        wait = BACKOFF_BASE ** attempt + random.uniform(0, 3)
                else:
                    wait = BACKOFF_BASE ** attempt + random.uniform(0, 3)
                
                print(f"  🚫 429 Rate limited - waiting {wait:.1f}s (attempt {attempt}/{OVERPASS_MAX_RETRIES})")
                time.sleep(wait)
                continue
                
            elif 500 <= response.status_code < 600:
                # Server error - exponential backoff
                wait = BACKOFF_BASE ** attempt + random.uniform(0, 3)
                print(f"  ⚠️  Server error {response.status_code} - retrying after {wait:.1f}s (attempt {attempt}/{OVERPASS_MAX_RETRIES})")
                time.sleep(wait)
                continue
            else:
                print(f"  ⚠️  API Error: {response.status_code}")
                return []
                
        except requests.exceptions.Timeout:
            wait = BACKOFF_BASE ** attempt + random.uniform(0, 3)
            print(f"  ⏱️  Timeout - retrying after {wait:.1f}s (attempt {attempt}/{OVERPASS_MAX_RETRIES})")
            time.sleep(wait)
            continue
        except requests.exceptions.RequestException as e:
            wait = BACKOFF_BASE ** attempt + random.uniform(0, 3)
            print(f"  🔌 Connection error: {str(e)} - retrying after {wait:.1f}s (attempt {attempt}/{OVERPASS_MAX_RETRIES})")
            time.sleep(wait)
            continue
        except Exception as e:
            wait = BACKOFF_BASE ** attempt + random.uniform(0, 3)
            print(f"  ❌ Error: {str(e)} - retrying after {wait:.1f}s (attempt {attempt}/{OVERPASS_MAX_RETRIES})")
            time.sleep(wait)
            continue
    
    print(f"  ❌ Failed after {OVERPASS_MAX_RETRIES} attempts")
    return []

def categorize_amenity(amenity_type):
    """Categorize amenity into broader types"""
    if not amenity_type:
        return None
    
    mapping = {
        'restaurant': 'food',
        'cafe': 'food',
        'fast_food': 'food',
        'food_court': 'food',
        'toilets': 'washroom',
        'hospital': 'medical',
        'clinic': 'medical',
        'pharmacy': 'medical',
        'hotel': 'hotel',
        'motel': 'hotel',
        'guest_house': 'hotel',
        'fuel': 'fuel',
        'atm': 'atm',
        'bank': 'atm',
        'parking': 'parking'
    }
    
    return mapping.get(amenity_type.lower())

def calculate_distance(lat1, lon1, lat2, lon2):
    """Calculate distance in meters using Haversine formula"""
    from math import radians, sin, cos, sqrt, atan2
    
    R = 6371000  # Earth's radius in meters
    
    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    delta_lat = radians(lat2 - lat1)
    delta_lon = radians(lon2 - lon1)
    
    a = sin(delta_lat/2)**2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon/2)**2
    c = 2 * atan2(sqrt(a), sqrt(1-a))
    
    return R * c

def update_stations_with_empty_amenities():
    """
    Find all stations in DB with empty amenities array and fetch ALL amenities for them
    """
    print("🚀 Starting amenities update for stations with empty amenities...")
    
    # Find all stations with empty amenities array
    stations_to_update = list(collection.find({
        '$or': [
            {'amenities': {'$exists': False}},
            {'amenities': []},
            {'amenities': None}
        ]
    }))
    
    total_stations = len(stations_to_update)
    print(f"📊 Found {total_stations} stations with empty amenities\n")
    
    if total_stations == 0:
        print("✅ All stations already have amenities!")
        return
    
    updated_count = 0
    failed_count = 0
    
    for idx, station in enumerate(stations_to_update, 1):
        try:
            name = station.get('name', 'Unknown')
            city = station.get('city', 'Unknown')
            latitude = station.get('latitude')
            longitude = station.get('longitude')
            
            if not latitude or not longitude:
                print(f"⚠️  [{idx}/{total_stations}] Skipping {name} - No coordinates")
                failed_count += 1
                continue
            
            print(f"\n[{idx}/{total_stations}] Processing: {name}, {city}")
            
            # Fetch ALL amenities from OSM
            all_amenities = fetch_amenities_from_osm(latitude, longitude, 2000)
            
            if not all_amenities:
                print(f"  ⚠️  No amenities found for {name}")
                # Still update to avoid reprocessing
                collection.update_one(
                    {'_id': station['_id']},
                    {
                        '$set': {
                            'amenities': [],
                            'amenitiesDetail': [],
                            'updatedAt': datetime.utcnow()
                        }
                    }
                )
                updated_count += 1
                time.sleep(IMPORT_SLEEP_SECONDS)
                continue
            
            # Extract unique category names for quick filtering
            amenity_categories = list(set([a['type'] for a in all_amenities]))
            
            # Update the station in DB with ALL amenities
            collection.update_one(
                {'_id': station['_id']},
                {
                    '$set': {
                        'amenities': amenity_categories,
                        'amenitiesDetail': all_amenities,  # Store ALL amenities
                        'updatedAt': datetime.utcnow()
                    }
                }
            )
            
            updated_count += 1
            print(f"  ✅ Updated with {len(all_amenities)} total amenities ({len(amenity_categories)} types)")
            
            # Rate limiting - wait between requests to avoid 429
            time.sleep(IMPORT_SLEEP_SECONDS)
            
        except Exception as e:
            print(f"  ❌ Error updating {station.get('name', 'Unknown')}: {str(e)}")
            failed_count += 1
            continue
    
    print(f"\n{'='*60}")
    print(f"✅ Update Complete!")
    print(f"📊 Total Processed: {total_stations}")
    print(f"✅ Successfully Updated: {updated_count}")
    print(f"❌ Failed: {failed_count}")
    print(f"{'='*60}")

def import_stations_from_csv(csv_path):
    """Import stations from CSV with ALL amenities pre-fetched"""
    
    print("🚀 Starting import process...")
    print(f"📂 Reading CSV: {csv_path}")
    
    # Clear existing collection
    collection.delete_many({})
    print("🗑️  Cleared existing stations\n")
    
    imported_count = 0
    error_count = 0
    
    with open(csv_path, 'r', encoding='utf-8') as file:
        csv_reader = csv.DictReader(file)
        
        for idx, row in enumerate(csv_reader, 1):
            try:
                name = row.get('name', '').strip()
                city = row.get('city', '').strip()
                address = row.get('address', '').strip()
                latitude = float(row.get('lattitude', 0))
                longitude = float(row.get('longitude', 0))
                charger_type = row.get('type', '').strip()
                
                # Skip if coordinates are invalid
                if latitude == 0 or longitude == 0:
                    print(f"⚠️  Skipping {name} - Invalid coordinates")
                    error_count += 1
                    continue
                
                print(f"\n[{idx}] Processing: {name}, {city}")
                
                # Fetch ALL amenities from OSM
                all_amenities = fetch_amenities_from_osm(latitude, longitude, 2000)
                
                # Extract unique category names for quick filtering
                amenity_categories = list(set([a['type'] for a in all_amenities]))
                
                # Prepare station document
                station = {
                    'name': name,
                    'city': city if city else 'Unknown',
                    'address': address if address else 'Address not available',
                    'latitude': latitude,
                    'longitude': longitude,
                    'type': determine_charger_type(charger_type),
                    'amenities': amenity_categories,
                    'amenitiesDetail': all_amenities,  # Store ALL amenities
                    'powerKw': determine_power(charger_type),
                    'numberOfChargers': 1,
                    'isOperational': True,
                    'createdAt': datetime.utcnow(),
                    'importedFrom': 'CSV'
                }
                
                # Insert into MongoDB
                collection.insert_one(station)
                imported_count += 1
                
                print(f"  ✅ Imported with {len(all_amenities)} total amenities ({len(amenity_categories)} types)")
                
                # Rate limiting - wait between requests
                time.sleep(IMPORT_SLEEP_SECONDS)
                
            except Exception as e:
                print(f"  ❌ Error processing {row.get('name', 'Unknown')}: {str(e)}")
                error_count += 1
                continue
    
    print(f"\n{'='*60}")
    print(f"✅ Import Complete!")
    print(f"📊 Total Processed: {idx}")
    print(f"✅ Successfully Imported: {imported_count}")
    print(f"❌ Errors: {error_count}")
    print(f"{'='*60}")

def determine_charger_type(type_str):
    """Determine charger type from CSV type field"""
    if not type_str:
        return 'fast'
    
    type_num = type_str.strip()
    
    # Map based on power ratings
    if type_num in ['6', '7']:
        return 'slow'
    elif type_num in ['8', '10', '11']:
        return 'fast'
    elif type_num in ['13', '14', '15']:
        return 'rapid'
    elif type_num in ['16', '17', '18', '19', '20']:
        return 'ultra-fast'
    else:
        return 'fast'

def determine_power(type_str):
    """Determine power in kW from type"""
    if not type_str:
        return 50
    
    type_num = type_str.strip()
    
    power_map = {
        '6': 7,
        '7': 22,
        '8': 50,
        '10': 50,
        '11': 50,
        '13': 60,
        '14': 120,
        '15': 150,
        '16': 150,
        '17': 150,
        '18': 150,
        '19': 150,
        '20': 150,
    }
    
    return power_map.get(type_num, 50)

if __name__ == "__main__":
    import sys
    
    # Check command line argument
    if len(sys.argv) > 1 and sys.argv[1] == '--update-empty':
        # Update mode - only update stations with empty amenities
        update_stations_with_empty_amenities()
    else:
        # Import mode - full import from CSV
        CSV_FILE_PATH = os.getenv('CSV_FILE_PATH', r".\ev-charging-stations-india.csv")
        
        # Check if file exists
        if not os.path.exists(CSV_FILE_PATH):
            print(f"❌ CSV file not found: {CSV_FILE_PATH}")
            print(f"\nUsage:")
            print(f"  Full import: python {sys.argv[0]}")
            print(f"  Update empty: python {sys.argv[0]} --update-empty")
            exit(1)
        
        # Start import
        import_stations_from_csv(CSV_FILE_PATH)
    
    print("\n🎉 All done! Stations are now in MongoDB with pre-fetched amenities.")
