"""
Comprehensive test to verify profile images work for all user types
"""
import sys
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database.connection import db
from bson import ObjectId

def test_all_published_posts():
    """Test profile image resolution for all published blog posts"""
    print("=" * 80)
    print("Testing ALL Published Blog Posts - Profile Image Resolution")
    print("=" * 80)
    
    # Get all published blog posts
    published_posts = list(db.blogs.find({"status": "published"}).limit(10))
    
    if not published_posts:
        print("❌ No published blog posts found in database")
        return
    
    print(f"\n✅ Found {len(published_posts)} published blog posts (showing first 10)\n")
    
    success_count = 0
    fail_count = 0
    
    for idx, post in enumerate(published_posts, 1):
        print(f"\n{'='*80}")
        print(f"Post #{idx}: {post.get('title', 'Untitled')[:60]}")
        print(f"{'='*80}")
        
        user_id = post.get('user_id')
        if not user_id:
            print("❌ No user_id in post")
            fail_count += 1
            continue
        
        # Fetch user
        user = db.users.find_one({"_id": ObjectId(user_id) if isinstance(user_id, str) else user_id})
        
        if not user:
            print(f"❌ User not found: {user_id}")
            fail_count += 1
            continue
        
        print(f"Author: {user.get('full_name', 'Unknown')}")
        print(f"Email: {user.get('email', 'N/A')}")
        print(f"Auth Provider: {user.get('auth_provider', 'N/A')}")
        
        # Test the resolution logic
        profile_picture = None
        
        # Step 1: Check profile_picture_url
        if user.get('profile_picture_url'):
            profile_picture = user['profile_picture_url'].strip()
            print(f"✅ Found in profile_picture_url: {profile_picture[:70]}...")
            success_count += 1
            continue
        
        # Step 2: Check social_auth_data
        social_auth_data = user.get('social_auth_data', {})
        
        if social_auth_data.get('google', {}).get('picture'):
            profile_picture = social_auth_data['google']['picture'].strip()
            print(f"✅ Found in social_auth_data.google: {profile_picture[:70]}...")
            success_count += 1
            continue
        
        if social_auth_data.get('fitbit'):
            fitbit_data = social_auth_data['fitbit']
            fitbit_pic = fitbit_data.get('avatar640') or fitbit_data.get('avatar150') or fitbit_data.get('avatar')
            if fitbit_pic:
                profile_picture = fitbit_pic.strip()
                print(f"✅ Found in social_auth_data.fitbit: {profile_picture[:70]}...")
                success_count += 1
                continue
        
        # Step 3: Check onboarding_step1
        if user.get('auth_provider') == 'form':
            onboarding = db.onboarding_step1.find_one({"user_id": user_id})
            if onboarding and onboarding.get('profile_picture_url'):
                profile_picture = onboarding['profile_picture_url'].strip()
                print(f"✅ Found in onboarding_step1: {profile_picture[:70]}...")
                success_count += 1
                continue
        
        print("❌ No profile picture found for this user")
        print(f"   - profile_picture_url: {user.get('profile_picture_url', 'Not set')}")
        print(f"   - social_auth_data providers: {', '.join(social_auth_data.keys()) if social_auth_data else 'None'}")
        print(f"   - auth_provider: {user.get('auth_provider', 'Not set')}")
        fail_count += 1
    
    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"✅ Posts with profile pictures: {success_count}/{len(published_posts)}")
    print(f"❌ Posts without profile pictures: {fail_count}/{len(published_posts)}")
    
    if fail_count == 0:
        print("\n🎉 SUCCESS! All posts have profile pictures!")
    else:
        print(f"\n⚠️  {fail_count} posts missing profile pictures")

if __name__ == "__main__":
    try:
        test_all_published_posts()
    except Exception as e:
        print(f"❌ Error running test: {e}")
        import traceback
        traceback.print_exc()
