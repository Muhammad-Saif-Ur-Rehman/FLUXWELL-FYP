# app/routers/ai_realtime.py
from fastapi import APIRouter, Depends, HTTPException
from app.auth.jwt_auth import get_current_user_id
from app.database.connection import db
from datetime import datetime, timedelta
import httpx
import os
import asyncio
from typing import Dict, Any, List

router = APIRouter(prefix="/api/ai/realtime", tags=["AI-Realtime"])

# Enhanced thresholds with more comprehensive health ranges
THRESHOLDS = {
    "heart_rate": {"min": 50, "max": 120, "critical_min": 40, "critical_max": 150},  # bpm
    "oxygen_saturation": {"min": 94, "max": 100, "critical_min": 90, "critical_max": 100},  # %
    "blood_pressure_systolic": {"min": 90, "max": 140, "critical_min": 80, "critical_max": 160},
    "blood_pressure_diastolic": {"min": 60, "max": 90, "critical_min": 50, "critical_max": 100},
    "body_temperature": {"min": 36.1, "max": 37.5, "critical_min": 35.0, "critical_max": 38.5},  # °C
    "blood_glucose": {"min": 70, "max": 140, "critical_min": 60, "critical_max": 200},  # mg/dL
    "steps": {"min": 1000, "max": 15000, "critical_min": 500, "critical_max": 25000},  # daily steps
    "calories": {"min": 1200, "max": 3000, "critical_min": 800, "critical_max": 4000},  # daily calories
}

def analyze_metric(key: str, value: Any) -> Dict[str, Any]:
    """Analyze a single metric and return analysis results"""
    if key not in THRESHOLDS:
        return None
    
    # Convert value to number if possible
    try:
        if isinstance(value, str):
            # Handle blood pressure format "120/80"
            if key in ["blood_pressure_systolic", "blood_pressure_diastolic"] and "/" in value:
                parts = value.split("/")
                if key == "blood_pressure_systolic":
                    value = float(parts[0])
                else:
                    value = float(parts[1])
            else:
                value = float(value)
    except (ValueError, IndexError):
        return None
    
    th = THRESHOLDS[key]
    severity = "normal"
    message = ""
    recommendation = ""
    
    if value < th["critical_min"] or value > th["critical_max"]:
        severity = "critical"
        if value < th["critical_min"]:
            message = f"{key.replace('_', ' ').title()} is critically low ({value})"
            recommendation = "Seek immediate medical attention"
        else:
            message = f"{key.replace('_', ' ').title()} is critically high ({value})"
            recommendation = "Seek immediate medical attention"
    elif value < th["min"] or value > th["max"]:
        severity = "warning"
        if value < th["min"]:
            message = f"{key.replace('_', ' ').title()} is below normal range ({value})"
            recommendation = "Consider rest, hydration, or consulting a healthcare provider"
        else:
            message = f"{key.replace('_', ' ').title()} is above normal range ({value})"
            recommendation = "Consider reducing activity, staying hydrated, or consulting a healthcare provider"
    else:
        severity = "normal"
        message = f"{key.replace('_', ' ').title()} is within normal range"
        recommendation = "Keep up the good work!"
    
    return {
        "metric": key,
        "value": value,
        "severity": severity,
        "message": message,
        "recommendation": recommendation
    }

def generate_ai_summary(analyses: List[Dict[str, Any]]) -> str:
    """Generate AI-powered summary based on metric analyses"""
    critical_issues = [a for a in analyses if a["severity"] == "critical"]
    warning_issues = [a for a in analyses if a["severity"] == "warning"]
    normal_metrics = [a for a in analyses if a["severity"] == "normal"]
    
    if critical_issues:
        return f"🚨 CRITICAL ALERT: {len(critical_issues)} critical health indicators detected. Please seek immediate medical attention for: {', '.join([a['metric'].replace('_', ' ') for a in critical_issues])}"
    elif warning_issues:
        return f"⚠️ Health Advisory: {len(warning_issues)} metrics outside normal range. Consider: {', '.join([a['recommendation'] for a in warning_issues[:2]])}"
    elif normal_metrics:
        return "✅ All health metrics are within normal ranges. Great job maintaining your health!"
    else:
        return "📊 Analyzing your health data... Please ensure your health service is properly connected."

@router.get("/suggestions")
async def realtime_suggestions(user_id: str = Depends(get_current_user_id)):
    """Get AI-powered health suggestions based on current metrics"""
    try:
        from bson import ObjectId
        user_object_id = ObjectId(user_id)
        
        # Get user's current health service provider
        user = db.users.find_one({"_id": user_object_id})
        if not user:
            raise HTTPException(404, "User not found")
        
        # Check if user has connected health service
        auth_provider = user.get("auth_provider", "form")
        health_service_provider = user.get("health_service_provider")
        
        if auth_provider in ["google", "fitbit"]:
            provider = auth_provider
        else:
            provider = health_service_provider
            
        if not provider or not user.get("access_token"):
            return {
                "summary": "🔌 Please connect a health service to receive personalized AI suggestions based on your real-time health data.",
                "anomalies": [],
                "analyses": [],
                "connected": False
            }
        
        # Get current metrics by calling the realtime metrics endpoint logic
        try:
            # Import the realtime router's get_metrics function
            from app.routers.realtime import get_metrics
            
            # Call the get_metrics function directly with the resolved user_id
            metrics_response = await get_metrics(user_id)
            metrics_data = metrics_response
        except Exception as e:
            print(f"❌ Error fetching metrics for AI analysis: {e}")
            # Fallback to basic analysis
            metrics_data = {
                "heart_rate": 0,
                "steps": 0,
                "calories": 0,
                "distance": 0,
                "blood_pressure": "120/80",
                "blood_glucose": 0,
                "oxygen_saturation": 0,
                "body_temperature": 0,
                "sleep": "light"
            }
        
        # Analyze each metric
        analyses = []
        anomalies = []
        
        # Map the metrics to our analysis format
        metric_mapping = {
            "heart_rate": metrics_data.get("heart_rate", 0),
            "oxygen_saturation": metrics_data.get("oxygen_saturation", 0),
            "blood_pressure": metrics_data.get("blood_pressure", "120/80"),
            "body_temperature": metrics_data.get("body_temperature", 0),
            "blood_glucose": metrics_data.get("blood_glucose", 0),
            "steps": metrics_data.get("steps", 0),
            "calories": metrics_data.get("calories", 0)
        }
        
        # Handle blood pressure separately
        if "blood_pressure" in metric_mapping and "/" in str(metric_mapping["blood_pressure"]):
            bp_parts = str(metric_mapping["blood_pressure"]).split("/")
            if len(bp_parts) == 2:
                metric_mapping["blood_pressure_systolic"] = float(bp_parts[0])
                metric_mapping["blood_pressure_diastolic"] = float(bp_parts[1])
        
        for metric_key, value in metric_mapping.items():
            if value and value != 0:  # Only analyze non-zero values
                analysis = analyze_metric(metric_key, value)
                if analysis:
                    analyses.append(analysis)
                    if analysis["severity"] in ["warning", "critical"]:
                        anomalies.append(analysis["message"])
        
        # Generate AI summary
        summary = generate_ai_summary(analyses)
        
        return {
            "summary": summary,
            "anomalies": anomalies,
            "analyses": analyses,
            "connected": True,
            "provider": provider,
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        print(f"❌ Error in realtime_suggestions: {e}")
        return {
            "summary": f"❌ Error generating suggestions: {str(e)}",
            "anomalies": [],
            "analyses": [],
            "connected": False,
            "error": str(e)
        }

