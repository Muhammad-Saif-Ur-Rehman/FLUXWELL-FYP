# server/tests/test_realtime.py
import pytest
import asyncio
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
from datetime import datetime, timedelta

from app.main import app
from app.routers.realtime import generate_mock_data, fetch_google_fit, fetch_fitbit

client = TestClient(app)

# Test data
MOCK_USER_DATA = {
    "_id": "test_user_id",
    "auth_provider": "form",
    "access_token": "test_token"
}

MOCK_GOOGLE_USER = {
    "_id": "google_user_id", 
    "auth_provider": "google",
    "access_token": "google_test_token"
}

MOCK_FITBIT_USER = {
    "_id": "fitbit_user_id",
    "auth_provider": "fitbit", 
    "access_token": "fitbit_test_token"
}

class TestRealtimeAPI:
    """Test cases for realtime API endpoints"""
    
    @patch('app.routers.realtime.db')
    @patch('app.auth.get_current_user_id')
    def test_get_metrics_form_user(self, mock_get_user_id, mock_db):
        """Test metrics endpoint for form-based user returns mock data"""
        mock_get_user_id.return_value = "test_user_id"
        mock_db.users.find_one.return_value = MOCK_USER_DATA
        
        response = client.get("/api/realtime/metrics")
        
        assert response.status_code == 200
        data = response.json()
        
        # Check that all expected fields are present
        expected_fields = [
            "steps", "heart_rate", "calories", "distance", 
            "blood_pressure", "blood_glucose", "oxygen_saturation", 
            "body_temperature", "sleep"
        ]
        
        for field in expected_fields:
            assert field in data
        
        # Check data types and ranges
        assert isinstance(data["steps"], int)
        assert 50 <= data["steps"] <= 150
        assert isinstance(data["heart_rate"], int)
        assert 60 <= data["heart_rate"] <= 100
        assert isinstance(data["calories"], int)
        assert 5 <= data["calories"] <= 15
        assert isinstance(data["distance"], float)
        assert 0.05 <= data["distance"] <= 0.2
        assert "/" in data["blood_pressure"]  # Format: "120/80"
        assert isinstance(data["blood_glucose"], int)
        assert 80 <= data["blood_glucose"] <= 120
        assert isinstance(data["oxygen_saturation"], int)
        assert 95 <= data["oxygen_saturation"] <= 99
        assert isinstance(data["body_temperature"], float)
        assert 36.5 <= data["body_temperature"] <= 37.2
        assert data["sleep"] in ["light", "deep", "rem"]

    @patch('app.routers.realtime.db')
    @patch('app.auth.get_current_user_id')
    def test_get_metrics_user_not_found(self, mock_get_user_id, mock_db):
        """Test metrics endpoint returns 404 when user not found"""
        mock_get_user_id.return_value = "nonexistent_user"
        mock_db.users.find_one.return_value = None
        
        response = client.get("/api/realtime/metrics")
        
        assert response.status_code == 404
        assert "User not found" in response.json()["detail"]

    @patch('app.routers.realtime.db')
    @patch('app.auth.get_current_user_id')
    @patch('app.routers.realtime.fetch_google_fit')
    def test_get_metrics_google_user(self, mock_fetch_google, mock_get_user_id, mock_db):
        """Test metrics endpoint for Google user calls Google Fit API"""
        mock_get_user_id.return_value = "google_user_id"
        mock_db.users.find_one.return_value = MOCK_GOOGLE_USER
        
        # Mock Google Fit API responses
        mock_google_response = {
            "bucket": [{
                "dataset": [{
                    "point": [{
                        "value": [{"intVal": 1000}]
                    }]
                }]
            }]
        }
        mock_fetch_google.return_value = mock_google_response
        
        response = client.get("/api/realtime/metrics")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify Google Fit was called for each metric
        assert mock_fetch_google.call_count == 9  # 9 different metrics
        
        # Check that all expected fields are present
        expected_fields = [
            "steps", "heart_rate", "calories", "distance", 
            "blood_pressure", "blood_glucose", "oxygen_saturation", 
            "body_temperature", "sleep"
        ]
        
        for field in expected_fields:
            assert field in data

    @patch('app.routers.realtime.db')
    @patch('app.auth.get_current_user_id')
    @patch('app.routers.realtime.fetch_fitbit')
    def test_get_metrics_fitbit_user(self, mock_fetch_fitbit, mock_get_user_id, mock_db):
        """Test metrics endpoint for Fitbit user calls Fitbit API"""
        mock_get_user_id.return_value = "fitbit_user_id"
        mock_db.users.find_one.return_value = MOCK_FITBIT_USER
        
        # Mock Fitbit API responses
        mock_fitbit_response = {
            "activities-steps": [{"value": "5000"}],
            "activities-heart": [{"value": {"restingHeartRate": 70}}],
            "activities-calories": [{"value": "2000"}],
            "activities-distance": [{"value": "3.5"}],
            "bp": [{"systolic": 120, "diastolic": 80}],
            "glucose": [{"value": 95}],
            "spo2": [{"value": 98}],
            "temp": [{"value": 36.8}],
            "sleep": [{"levels": {"summary": {"deep": {"count": 3, "minutes": 45}}}}
        }
        mock_fetch_fitbit.return_value = mock_fitbit_response
        
        response = client.get("/api/realtime/metrics")
        
        assert response.status_code == 200
        data = response.json()
        
        # Verify Fitbit was called for each metric
        assert mock_fetch_fitbit.call_count == 9  # 9 different metrics
        
        # Check that all expected fields are present
        expected_fields = [
            "steps", "heart_rate", "calories", "distance", 
            "blood_pressure", "blood_glucose", "oxygen_saturation", 
            "body_temperature", "sleep"
        ]
        
        for field in expected_fields:
            assert field in data

class TestRealtimeHelpers:
    """Test cases for realtime helper functions"""
    
    def test_generate_mock_data(self):
        """Test mock data generation produces valid data"""
        data = generate_mock_data()
        
        # Test all fields are present
        expected_fields = [
            "steps", "heart_rate", "calories", "distance", 
            "blood_pressure", "blood_glucose", "oxygen_saturation", 
            "body_temperature", "sleep"
        ]
        
        for field in expected_fields:
            assert field in data
        
        # Test data ranges
        assert 50 <= data["steps"] <= 150
        assert 60 <= data["heart_rate"] <= 100
        assert 5 <= data["calories"] <= 15
        assert 0.05 <= data["distance"] <= 0.2
        assert "/" in data["blood_pressure"]
        assert 80 <= data["blood_glucose"] <= 120
        assert 95 <= data["oxygen_saturation"] <= 99
        assert 36.5 <= data["body_temperature"] <= 37.2
        assert data["sleep"] in ["light", "deep", "rem"]

    @pytest.mark.asyncio
    @patch('httpx.AsyncClient')
    async def test_fetch_google_fit(self, mock_client):
        """Test Google Fit API fetching"""
        mock_response = MagicMock()
        mock_response.json.return_value = {"test": "data"}
        mock_response.raise_for_status.return_value = None
        
        mock_client.return_value.__aenter__.return_value.post.return_value = mock_response
        
        result = await fetch_google_fit("test_token", "com.google.step_count.delta")
        
        assert result == {"test": "data"}
        mock_client.return_value.__aenter__.return_value.post.assert_called_once()

    @pytest.mark.asyncio
    @patch('httpx.AsyncClient')
    async def test_fetch_fitbit(self, mock_client):
        """Test Fitbit API fetching"""
        mock_response = MagicMock()
        mock_response.json.return_value = {"test": "data"}
        mock_response.raise_for_status.return_value = None
        
        mock_client.return_value.__aenter__.return_value.get.return_value = mock_response
        
        result = await fetch_fitbit("test_token", "/test/endpoint")
        
        assert result == {"test": "data"}
        mock_client.return_value.__aenter__.return_value.get.assert_called_once()

class TestRealtimeIntegration:
    """Integration tests for realtime functionality"""
    
    @patch('app.routers.realtime.db')
    @patch('app.auth.get_current_user_id')
    def test_realtime_metrics_flow(self, mock_get_user_id, mock_db):
        """Test complete realtime metrics flow"""
        # Setup
        mock_get_user_id.return_value = "test_user_id"
        mock_db.users.find_one.return_value = MOCK_USER_DATA
        
        # Test initial request
        response = client.get("/api/realtime/metrics")
        assert response.status_code == 200
        
        # Test that data is consistent
        data1 = response.json()
        data2 = client.get("/api/realtime/metrics").json()
        
        # Mock data should be different (randomized)
        # but structure should be the same
        assert set(data1.keys()) == set(data2.keys())
        
        # Test all required fields are present
        required_fields = [
            "steps", "heart_rate", "calories", "distance", 
            "blood_pressure", "blood_glucose", "oxygen_saturation", 
            "body_temperature", "sleep"
        ]
        
        for field in required_fields:
            assert field in data1
            assert field in data2

if __name__ == "__main__":
    pytest.main([__file__])
