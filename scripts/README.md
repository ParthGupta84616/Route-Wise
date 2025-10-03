# EV Station Import Script

This script imports EV charging stations from CSV into MongoDB with pre-fetched amenities.

## Setup

1. Install Python dependencies:
```bash
pip install -r requirements.txt
```

2. Make sure MongoDB is running:
```bash
# Check if MongoDB is running
mongod --version
```

3. Update the CSV file path in the script:
```python
CSV_FILE_PATH = r"C:\Users\Parth\Downloads\ev-charging-stations-india.csv"
```

## Run the Script

```bash
python scripts/import_stations_with_amenities.py
```

## What It Does

1. ✅ Reads CSV file with station data
2. ✅ For each station, fetches nearby amenities (within 2km) from OpenStreetMap
3. ✅ Stores amenities with:
   - Type (food, washroom, medical, hotel, fuel, atm, parking)
   - Name
   - Distance in meters
   - Coordinates
4. ✅ Inserts into MongoDB

## Output

Each station document will have:

```json
{
  "name": "Station Name",
  "city": "City",
  "address": "Address",
  "latitude": 12.9716,
  "longitude": 77.5946,
  "type": "fast",
  "amenities": ["food", "washroom", "fuel"],
  "amenitiesDetail": [
    {
      "type": "food",
      "amenity": "restaurant",
      "name": "Restaurant Name",
      "distance": 450.5,
      "lat": 12.9720,
      "lng": 77.5950
    }
  ],
  "powerKw": 50,
  "numberOfChargers": 1,
  "isOperational": true
}
```

## Notes

- Script includes 2-second delay between requests to respect API rate limits
- Takes ~30-45 minutes for 1000 stations
- Invalid coordinates are skipped
- Amenities are sorted by distance (closest first)
