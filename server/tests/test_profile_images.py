"""
Test script to verify profile image resolution for blog posts
This will help debug why profile images aren't loading for unauthorized users
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database.connection import db
from bson import ObjectId

def test_profile_image_resolution():
    """Test the profile image resolution logic"""
    print("=" * 80)
    print("Testing Profile Image Resolution for Blog Authors")
    print("=" * 80)
    
    # Get a sample published blog post
    sample_post = db.blogs.find_one({"status": "published"})
    
    if not sample_post:
        print("❌ No published blog posts found in database")
        return
    
    print(f"\n✅ Found sample blog post: {sample_post.get('title', 'Untitled')[:50]}")
    print(f"   Author User ID: {sample_post.get('user_id')}")
    
    user_id = sample_post.get('user_id')
    if not user_id:
        print("❌ Blog post has no user_id")
        return
    
    # Fetch the user
    user = db.users.find_one({"_id": ObjectId(user_id) if isinstance(user_id, str) else user_id})
    
    if not user:
        print(f"❌ User not found for user_id: {user_id}")
        return
    
    print(f"\n✅ Found user: {user.get('full_name', 'Unknown')}")
    print(f"   Email: {user.get('email', 'N/A')}")
    print(f"   Auth Provider: {user.get('auth_provider', 'N/A')}")
    
    # Check profile_picture_url in user document
    profile_picture_url = user.get('profile_picture_url')
    print(f"\n📸 profile_picture_url in user document: {profile_picture_url if profile_picture_url else '❌ Not set'}")
    
    # Check social_auth_data
    social_auth_data = user.get('social_auth_data', {})
    print(f"\n🔐 social_auth_data present: {'✅ Yes' if social_auth_data else '❌ No'}")
    
    if social_auth_data:
        print(f"   Available providers: {', '.join(social_auth_data.keys())}")
        
        # Check Google data
        if 'google' in social_auth_data:
            google_data = social_auth_data['google']
            google_picture = google_data.get('picture')
            print(f"\n   🔵 Google profile picture: {google_picture if google_picture else '❌ Not set'}")
        
        # Check Fitbit data
        if 'fitbit' in social_auth_data:
            fitbit_data = social_auth_data['fitbit']
            fitbit_avatar = fitbit_data.get('avatar640') or fitbit_data.get('avatar150') or fitbit_data.get('avatar')
            print(f"\n   🟣 Fitbit avatar: {fitbit_avatar if fitbit_avatar else '❌ Not set'}")
    
    # Check onboarding_step1 for form users
    if user.get('auth_provider') == 'form':
        onboarding = db.onboarding_step1.find_one({"user_id": user_id})
        if onboarding:
            onboarding_picture = onboarding.get('profile_picture_url')
            print(f"\n📝 onboarding_step1 profile_picture_url: {onboarding_picture if onboarding_picture else '❌ Not set'}")
        else:
            print(f"\n❌ No onboarding_step1 document found for user")
    
    # Test what the helper function would return
    print("\n" + "=" * 80)
    print("Testing _get_user_profile_picture() logic:")
    print("=" * 80)
    
    # Simulate the NEW helper function logic (checks social_auth_data regardless of auth_provider)
    final_picture = None
    
    # Step 1: Check profile_picture_url
    if profile_picture_url and profile_picture_url.strip():
        final_picture = profile_picture_url.strip()
        print(f"✅ Would return from profile_picture_url: {final_picture[:80]}")
    else:
        # Step 2: Check social_auth_data (regardless of auth_provider - handles hybrid users)
        
        # Try Google first
        if social_auth_data.get('google'):
            google_picture = social_auth_data['google'].get('picture')
            if google_picture and google_picture.strip():
                final_picture = google_picture.strip()
                print(f"✅ Would return from Google social_auth_data: {final_picture[:80]}")
        
        # Try Fitbit if Google not found
        if not final_picture and social_auth_data.get('fitbit'):
            fitbit_data = social_auth_data['fitbit']
            fitbit_picture = (
                fitbit_data.get('avatar640') or 
                fitbit_data.get('avatar150') or 
                fitbit_data.get('avatar')
            )
            if fitbit_picture and fitbit_picture.strip():
                final_picture = fitbit_picture.strip()
                print(f"✅ Would return from Fitbit social_auth_data: {final_picture[:80]}")
        
        # Finally check onboarding_step1 for pure form users
        if not final_picture:
            auth_provider = user.get('auth_provider', 'form')
            if auth_provider == 'form':
                onboarding = db.onboarding_step1.find_one({"user_id": user_id})
                if onboarding:
                    onboarding_picture = onboarding.get('profile_picture_url')
                    if onboarding_picture and onboarding_picture.strip():
                        final_picture = onboarding_picture.strip()
                        print(f"✅ Would return from onboarding_step1: {final_picture[:80]}")
    
    if not final_picture:
        print("❌ No profile picture would be returned - this is the issue!")
        print("\n🔍 Debugging recommendations:")
        print("   1. Check if social_auth_data is properly populated for this user")
        print("   2. Verify the auth_provider field is correct")
        print("   3. For form users, check if onboarding_step1 has profile_picture_url")
    
    print("\n" + "=" * 80)

if __name__ == "__main__":
    try:
        test_profile_image_resolution()
    except Exception as e:
        print(f"❌ Error running test: {e}")
        import traceback
        traceback.print_exc()
